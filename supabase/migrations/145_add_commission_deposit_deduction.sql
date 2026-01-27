-- Add commission deposit deduction functions
-- This migration creates functions for deducting overdue commission payments
-- from seller deposits and automatically resolving penalties

-- Function to deduct commission from deposit
-- Deducts overdue commission obligation from seller's deposit
CREATE OR REPLACE FUNCTION deduct_commission_from_deposit(
  p_seller_id UUID,
  p_obligation_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  deducted_amount DECIMAL,
  error_message TEXT
) AS $$
DECLARE
  v_obligation RECORD;
  v_deposit_balance DECIMAL;
  v_deduction_result RECORD;
BEGIN
  -- Get obligation details
  SELECT id, total_amount, currency, status
  INTO v_obligation
  FROM commission_payment_obligations
  WHERE id = p_obligation_id
    AND seller_id = p_seller_id
    AND status = 'overdue'
  FOR UPDATE;

  -- Check if obligation exists and is overdue
  IF NOT FOUND OR v_obligation.status != 'overdue' THEN
    RETURN QUERY SELECT
      false,
      0::DECIMAL,
      'Obligation not found or not overdue'::TEXT;
    RETURN;
  END IF;

  -- Get deposit balance
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
  INTO v_deposit_balance
  FROM seller_deposit_lots sdl
  WHERE seller_id = p_seller_id
    AND status = 'held';

  -- Check if balance is sufficient
  DECLARE
    v_obligation_amount_usd DECIMAL;
  BEGIN
    v_obligation_amount_usd := convert_to_usd(v_obligation.total_amount, COALESCE(v_obligation.currency, 'USD'));

    IF v_deposit_balance < v_obligation_amount_usd THEN
      RETURN QUERY SELECT
        false,
        0::DECIMAL,
        format('Insufficient deposit balance. Available: %.2f USD, Required: %.2f USD', 
          v_deposit_balance, v_obligation_amount_usd)::TEXT;
      RETURN;
    END IF;

    -- Deduct from deposit
    SELECT * INTO v_deduction_result
    FROM deduct_from_deposit(
      p_seller_id,
      v_obligation.total_amount,
      COALESCE(v_obligation.currency, 'USD'),
      '扣除未支付佣金',
      p_obligation_id,
      'commission'
    );

    -- If deduction successful, update obligation and commissions
    IF v_deduction_result.success THEN
      -- Update obligation status
      UPDATE commission_payment_obligations
      SET 
        status = 'paid',
        paid_at = NOW(),
        updated_at = NOW()
      WHERE id = p_obligation_id;

      -- Update related commission records
      UPDATE affiliate_commissions
      SET status = 'paid'
      WHERE order_id IN (
        SELECT id FROM orders WHERE seller_id = p_seller_id
      )
      AND status = 'pending';

      RETURN QUERY SELECT
        true,
        v_deduction_result.deducted_amount,
        NULL::TEXT;
    ELSE
      RETURN QUERY SELECT
        false,
        0::DECIMAL,
        COALESCE(v_deduction_result.error_message, 'Deduction failed')::TEXT;
    END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve commission penalty
-- Automatically resolves penalties when commission is paid
CREATE OR REPLACE FUNCTION resolve_commission_penalty(
  p_seller_id UUID,
  p_obligation_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  resolved_penalties INT,
  error_message TEXT
) AS $$
DECLARE
  v_penalty RECORD;
  v_resolved_count INT := 0;
BEGIN
  -- Find all active penalties related to this obligation
  FOR v_penalty IN
    SELECT id, penalty_type, status
    FROM seller_penalties
    WHERE seller_id = p_seller_id
      AND obligation_id = p_obligation_id
      AND status = 'active'
    FOR UPDATE
  LOOP
    -- Update penalty status
    UPDATE seller_penalties
    SET 
      status = 'resolved',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE id = v_penalty.id;

    -- Apply penalty reversal based on type
    CASE v_penalty.penalty_type
      WHEN 'restrict_sales' THEN
        -- Restore product creation permission
        UPDATE products
        SET payment_enabled = true,
            payment_disabled_reason = NULL
        WHERE seller_id = p_seller_id
          AND payment_enabled = false
          AND payment_disabled_reason = 'commission_overdue';

      WHEN 'suspend' THEN
        -- Restore seller role
        UPDATE profiles
        SET role = 'seller'
        WHERE id = p_seller_id
          AND role = 'seller_suspended';

      WHEN 'disable' THEN
        -- Restore seller role and show products
        UPDATE profiles
        SET role = 'seller'
        WHERE id = p_seller_id
          AND role = 'user';

        UPDATE products
        SET status = 'active'
        WHERE seller_id = p_seller_id
          AND status = 'hidden';

      ELSE
        -- 'warning' type doesn't need reversal
        NULL;
    END CASE;

    v_resolved_count := v_resolved_count + 1;
  END LOOP;

  RETURN QUERY SELECT
    true,
    v_resolved_count,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for efficient commission obligation queries
CREATE INDEX IF NOT EXISTS idx_commission_obligations_seller_overdue 
  ON commission_payment_obligations(seller_id, status) 
  WHERE status = 'overdue';
