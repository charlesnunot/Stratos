-- Add deposit balance calculation and deduction functions
-- This migration creates functions for calculating seller deposit balance
-- and deducting from deposits for debt collection

-- Function to get seller deposit balance
-- Returns the total available deposit amount (held deposits minus deductions)
CREATE OR REPLACE FUNCTION get_seller_deposit_balance(p_seller_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total_held DECIMAL := 0;
  v_total_deducted DECIMAL := 0;
  v_balance DECIMAL;
BEGIN
  -- Calculate total held deposits
  SELECT COALESCE(SUM(required_amount), 0)
  INTO v_total_held
  FROM seller_deposit_lots
  WHERE seller_id = p_seller_id
    AND status = 'held';

  -- Calculate total deducted from deposits (stored in metadata)
  -- Deductions are recorded in metadata.deductions array
  SELECT COALESCE(SUM(
    (jsonb_array_elements(metadata->'deductions')->>'amount')::DECIMAL
  ), 0)
  INTO v_total_deducted
  FROM seller_deposit_lots
  WHERE seller_id = p_seller_id
    AND status = 'held'
    AND metadata ? 'deductions'
    AND jsonb_array_length(metadata->'deductions') > 0;

  -- Calculate balance
  v_balance := v_total_held - v_total_deducted;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct from deposit
-- Deducts amount from seller's deposits, starting from oldest deposits first
-- Handles currency conversion if debt currency differs from deposit currency
-- Returns the actual deducted amount (may be less than requested if insufficient balance)
CREATE OR REPLACE FUNCTION deduct_from_deposit(
  p_seller_id UUID,
  p_amount DECIMAL,
  p_amount_currency TEXT,
  p_reason TEXT,
  p_related_id UUID,
  p_related_type TEXT -- 'debt', 'commission', etc.
)
RETURNS TABLE (
  success BOOLEAN,
  deducted_amount DECIMAL,
  deducted_amount_currency TEXT,
  remaining_balance DECIMAL,
  error_message TEXT
) AS $$
DECLARE
  v_balance DECIMAL;
  v_remaining_to_deduct DECIMAL;
  v_deducted_total DECIMAL := 0;
  v_lot RECORD;
  v_deduction_amount DECIMAL;
  v_lot_balance DECIMAL;
  v_deductions JSONB;
  v_amount_usd DECIMAL;
  v_lot_amount_usd DECIMAL;
BEGIN
  -- Convert requested amount to USD for comparison
  v_amount_usd := convert_to_usd(p_amount, COALESCE(p_amount_currency, 'USD'));

  -- Get current balance (in USD, as deposits are stored in their original currency)
  -- We need to sum all deposits converted to USD
  SELECT COALESCE(SUM(
    convert_to_usd(required_amount, COALESCE(currency, 'USD')) - 
    COALESCE((
      SELECT SUM(convert_to_usd(
        (jsonb_array_elements(metadata->'deductions')->>'amount')::DECIMAL,
        COALESCE((jsonb_array_elements(metadata->'deductions')->>'currency')::TEXT, COALESCE(currency, 'USD'))
      ))
      FROM seller_deposit_lots sdl2
      WHERE sdl2.id = sdl.id
        AND sdl2.metadata ? 'deductions'
        AND jsonb_array_length(sdl2.metadata->'deductions') > 0
    ), 0)
  ), 0)
  INTO v_balance
  FROM seller_deposit_lots sdl
  WHERE seller_id = p_seller_id
    AND status = 'held';

  -- Check if balance is sufficient
  IF v_balance < v_amount_usd THEN
    RETURN QUERY SELECT
      false,
      0::DECIMAL,
      p_amount_currency,
      v_balance,
      format('Insufficient deposit balance. Available: %.2f USD, Required: %.2f USD', v_balance, v_amount_usd)::TEXT;
    RETURN;
  END IF;

  v_remaining_to_deduct := v_amount_usd;

  -- Deduct from oldest deposits first (ordered by held_at)
  FOR v_lot IN
    SELECT id, required_amount, metadata, currency
    FROM seller_deposit_lots
    WHERE seller_id = p_seller_id
      AND status = 'held'
    ORDER BY held_at ASC NULLS FIRST, created_at ASC
    FOR UPDATE -- Lock rows to prevent concurrent modifications
  LOOP
    IF v_remaining_to_deduct <= 0 THEN
      EXIT;
    END IF;

    -- Calculate available balance in this lot (in USD)
    v_deductions := COALESCE(v_lot.metadata->'deductions', '[]'::jsonb);
    
    -- Get lot amount in USD
    v_lot_amount_usd := convert_to_usd(v_lot.required_amount, COALESCE(v_lot.currency, 'USD'));
    
    -- Calculate already deducted amount in USD
    SELECT COALESCE(SUM(
      convert_to_usd(
        (jsonb_array_elements(v_deductions)->>'amount')::DECIMAL,
        COALESCE((jsonb_array_elements(v_deductions)->>'currency')::TEXT, COALESCE(v_lot.currency, 'USD'))
      )
    ), 0)
    INTO v_lot_balance
    FROM seller_deposit_lots
    WHERE id = v_lot.id;

    v_lot_balance := v_lot_amount_usd - v_lot_balance;

    -- Deduct from this lot (up to available balance, in USD)
    v_deduction_amount := LEAST(v_remaining_to_deduct, v_lot_balance);

    IF v_deduction_amount > 0 THEN
      -- Convert back to lot's currency for storage
      -- Store deduction in lot's currency for consistency
      DECLARE
        v_deduction_in_lot_currency DECIMAL;
      BEGIN
        -- Convert USD amount back to lot currency
        IF v_lot.currency = 'USD' OR v_lot.currency IS NULL THEN
          v_deduction_in_lot_currency := v_deduction_amount;
        ELSE
          -- Reverse conversion: USD to lot currency
          SELECT convert_to_usd(v_deduction_amount, 'USD') * 
                 (1.0 / (SELECT convert_to_usd(1.0, COALESCE(v_lot.currency, 'USD')) / 1.0))
          INTO v_deduction_in_lot_currency;
          -- Simplified: use direct rate lookup
          SELECT v_deduction_amount * 
            CASE COALESCE(v_lot.currency, 'USD')
              WHEN 'CNY' THEN 7.2
              WHEN 'EUR' THEN 0.92
              WHEN 'GBP' THEN 0.79
              WHEN 'JPY' THEN 150.0
              WHEN 'KRW' THEN 1300.0
              WHEN 'SGD' THEN 1.34
              WHEN 'HKD' THEN 7.82
              WHEN 'AUD' THEN 1.53
              WHEN 'CAD' THEN 1.36
              ELSE 1.0
            END
          INTO v_deduction_in_lot_currency;
        END IF;

        -- Add deduction record to metadata
        v_deductions := COALESCE(v_deductions, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'amount', v_deduction_in_lot_currency,
            'amount_usd', v_deduction_amount,
            'currency', COALESCE(v_lot.currency, 'USD'),
            'reason', p_reason,
            'related_id', p_related_id,
            'related_type', p_related_type,
            'deducted_at', NOW()
          )
        );

        -- Update lot metadata
        UPDATE seller_deposit_lots
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{deductions}',
          v_deductions
        )
        WHERE id = v_lot.id;

        v_deducted_total := v_deducted_total + v_deduction_amount;
        v_remaining_to_deduct := v_remaining_to_deduct - v_deduction_amount;
      END;
    END IF;
  END LOOP;

  -- Get updated balance
  SELECT COALESCE(SUM(
    convert_to_usd(required_amount, COALESCE(currency, 'USD')) - 
    COALESCE((
      SELECT SUM(convert_to_usd(
        (jsonb_array_elements(metadata->'deductions')->>'amount')::DECIMAL,
        COALESCE((jsonb_array_elements(metadata->'deductions')->>'currency')::TEXT, COALESCE(currency, 'USD'))
      ))
      FROM seller_deposit_lots sdl2
      WHERE sdl2.id = sdl.id
        AND sdl2.metadata ? 'deductions'
        AND jsonb_array_length(sdl2.metadata->'deductions') > 0
    ), 0)
  ), 0)
  INTO v_balance
  FROM seller_deposit_lots sdl
  WHERE seller_id = p_seller_id
    AND status = 'held';

  RETURN QUERY SELECT
    true,
    v_deducted_total,
    'USD'::TEXT,
    v_balance,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for efficient deposit balance queries
CREATE INDEX IF NOT EXISTS idx_seller_deposit_lots_seller_held 
  ON seller_deposit_lots(seller_id, status) 
  WHERE status = 'held';
