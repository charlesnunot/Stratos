-- Add debt collection functions
-- This migration creates functions for automatically collecting debts
-- from deposits and payouts

-- Function to collect debt from deposit
-- Automatically deducts pending debts from seller's deposit balance
CREATE OR REPLACE FUNCTION collect_debt_from_deposit(p_seller_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  collected_count INT,
  total_collected DECIMAL,
  error_message TEXT
) AS $$
DECLARE
  v_total_debt DECIMAL;
  v_debt_currency TEXT;
  v_deposit_balance DECIMAL;
  v_debt RECORD;
  v_collected_count INT := 0;
  v_total_collected DECIMAL := 0;
  v_deduction_result RECORD;
BEGIN
  -- Get total pending debt for seller
  SELECT COALESCE(SUM(debt_amount), 0), 
         MAX(currency) -- Use most common currency, or first one
  INTO v_total_debt, v_debt_currency
  FROM seller_debts
  WHERE seller_id = p_seller_id
    AND status = 'pending';

  -- If no debt, return success
  IF v_total_debt = 0 OR v_total_debt IS NULL THEN
    RETURN QUERY SELECT true, 0, 0::DECIMAL, NULL::TEXT;
    RETURN;
  END IF;

  -- Get deposit balance (in USD)
  SELECT get_seller_deposit_balance(p_seller_id) INTO v_deposit_balance;

  -- If no deposit balance, cannot collect
  IF v_deposit_balance <= 0 THEN
    RETURN QUERY SELECT 
      false, 
      0, 
      0::DECIMAL, 
      'No deposit balance available'::TEXT;
    RETURN;
  END IF;

  -- Process each pending debt, oldest first
  FOR v_debt IN
    SELECT id, debt_amount, currency, order_id, dispute_id, refund_id
    FROM seller_debts
    WHERE seller_id = p_seller_id
      AND status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE -- Lock rows to prevent concurrent processing
  LOOP
    -- Check if we have enough balance (convert debt to USD for comparison)
    DECLARE
      v_debt_amount_usd DECIMAL;
      v_current_balance DECIMAL;
    BEGIN
      v_debt_amount_usd := convert_to_usd(v_debt.debt_amount, COALESCE(v_debt.currency, 'USD'));
      
      -- Get current balance
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
      INTO v_current_balance
      FROM seller_deposit_lots sdl
      WHERE seller_id = p_seller_id
        AND status = 'held';

      -- If insufficient balance, stop
      IF v_current_balance < v_debt_amount_usd THEN
        EXIT;
      END IF;

      -- Deduct from deposit
      SELECT * INTO v_deduction_result
      FROM deduct_from_deposit(
        p_seller_id,
        v_debt.debt_amount,
        COALESCE(v_debt.currency, 'USD'),
        '偿还平台垫付退款债务',
        v_debt.id,
        'debt'
      );

      -- If deduction successful, update debt status
      IF v_deduction_result.success THEN
        UPDATE seller_debts
        SET 
          status = 'collected',
          collection_method = 'deposit_deduction',
          collected_at = NOW()
        WHERE id = v_debt.id;

        v_collected_count := v_collected_count + 1;
        v_total_collected := v_total_collected + v_deduction_result.deducted_amount;
      ELSE
        -- If deduction failed, stop processing
        EXIT;
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    true,
    v_collected_count,
    v_total_collected,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to collect debt from payout
-- Deducts pending debts from seller's payout amount
-- Returns the actual amount to pay seller after debt deduction
CREATE OR REPLACE FUNCTION collect_debt_from_payout(
  p_seller_id UUID,
  p_payout_amount DECIMAL,
  p_payout_currency TEXT
)
RETURNS TABLE (
  actual_payout_amount DECIMAL,
  deducted_debt_amount DECIMAL,
  remaining_debt DECIMAL
) AS $$
DECLARE
  v_total_debt DECIMAL;
  v_debt_currency TEXT;
  v_payout_amount_usd DECIMAL;
  v_total_debt_usd DECIMAL;
  v_deductible_amount DECIMAL;
  v_remaining_payout DECIMAL;
  v_debt RECORD;
  v_deducted_total DECIMAL := 0;
BEGIN
  -- Get total pending debt
  SELECT COALESCE(SUM(debt_amount), 0), 
         MAX(currency)
  INTO v_total_debt, v_debt_currency
  FROM seller_debts
  WHERE seller_id = p_seller_id
    AND status = 'pending';

  -- If no debt, return full payout
  IF v_total_debt = 0 OR v_total_debt IS NULL THEN
    RETURN QUERY SELECT 
      p_payout_amount, 
      0::DECIMAL, 
      0::DECIMAL;
    RETURN;
  END IF;

  -- Convert amounts to USD for comparison
  v_payout_amount_usd := convert_to_usd(p_payout_amount, COALESCE(p_payout_currency, 'USD'));
  v_total_debt_usd := convert_to_usd(v_total_debt, COALESCE(v_debt_currency, 'USD'));

  -- Calculate deductible amount (cannot exceed payout or debt)
  v_deductible_amount := LEAST(v_payout_amount_usd, v_total_debt_usd);
  v_remaining_payout := v_payout_amount_usd - v_deductible_amount;

  -- Process debts, oldest first, until deductible amount is reached
  FOR v_debt IN
    SELECT id, debt_amount, currency
    FROM seller_debts
    WHERE seller_id = p_seller_id
      AND status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    IF v_deductible_amount <= 0 THEN
      EXIT;
    END IF;

    DECLARE
      v_debt_amount_usd DECIMAL;
      v_debt_deduction DECIMAL;
    BEGIN
      v_debt_amount_usd := convert_to_usd(v_debt.debt_amount, COALESCE(v_debt.currency, 'USD'));
      v_debt_deduction := LEAST(v_deductible_amount, v_debt_amount_usd);

      -- Update debt status
      IF v_debt_deduction >= v_debt_amount_usd THEN
        -- Fully paid
        UPDATE seller_debts
        SET 
          status = 'collected',
          collection_method = 'payout_deduction',
          collected_at = NOW()
        WHERE id = v_debt.id;
      ELSE
        -- Partially paid (should not happen in normal flow, but handle it)
        -- For simplicity, mark as collected if deduction covers most of it
        UPDATE seller_debts
        SET 
          status = 'collected',
          collection_method = 'payout_deduction',
          collected_at = NOW()
        WHERE id = v_debt.id;
      END IF;

      v_deducted_total := v_deducted_total + v_debt_deduction;
      v_deductible_amount := v_deductible_amount - v_debt_deduction;
    END;
  END LOOP;

  -- Convert back to payout currency
  DECLARE
    v_actual_payout DECIMAL;
    v_deducted_debt DECIMAL;
  BEGIN
    IF p_payout_currency = 'USD' OR p_payout_currency IS NULL THEN
      v_actual_payout := v_remaining_payout;
      v_deducted_debt := v_deducted_total;
    ELSE
      -- Convert USD back to payout currency
      v_actual_payout := v_remaining_payout * 
        CASE p_payout_currency
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
        END;
      v_deducted_debt := v_deducted_total * 
        CASE p_payout_currency
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
        END;
    END IF;

    -- Get remaining debt
    SELECT COALESCE(SUM(convert_to_usd(debt_amount, COALESCE(currency, 'USD'))), 0)
    INTO v_total_debt_usd
    FROM seller_debts
    WHERE seller_id = p_seller_id
      AND status = 'pending';

    RETURN QUERY SELECT
      v_actual_payout,
      v_deducted_debt,
      v_total_debt_usd;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
