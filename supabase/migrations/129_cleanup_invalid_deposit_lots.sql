-- Cleanup invalid deposit_lots records
-- Re-check all 'required' deposit lots and update/delete if no longer needed
-- This fixes cases where deposit_lots were created but conditions changed

CREATE OR REPLACE FUNCTION cleanup_invalid_deposit_lots()
RETURNS TABLE (
  cleaned_count INT,
  cleaned_lot_ids UUID[]
) AS $$
DECLARE
  v_lot RECORD;
  v_deposit_check RECORD;
  v_cleaned_ids UUID[] := ARRAY[]::UUID[];
  v_count INT := 0;
BEGIN
  -- Loop through all 'required' deposit lots
  FOR v_lot IN
    SELECT id, seller_id, required_amount, created_at
    FROM seller_deposit_lots
    WHERE status = 'required'
    ORDER BY required_at DESC
  LOOP
    -- Re-check deposit requirement for this seller (with newOrderAmount = 0)
    SELECT 
      requires_deposit,
      required_amount,
      current_tier,
      suggested_tier,
      reason
    INTO v_deposit_check
    FROM check_seller_deposit_requirement(v_lot.seller_id, 0, 'USD')
    LIMIT 1;

    -- If deposit is no longer required, mark the lot as resolved
    IF NOT v_deposit_check.requires_deposit THEN
      -- Update the lot status (we can't delete because it has historical value)
      -- Instead, we'll mark it as resolved by updating to a different status
      -- Or we can delete it if it's very recent (within 1 hour)
      IF v_lot.created_at > NOW() - INTERVAL '1 hour' THEN
        -- Delete recent invalid lots
        DELETE FROM seller_deposit_lots WHERE id = v_lot.id;
        v_cleaned_ids := array_append(v_cleaned_ids, v_lot.id);
        v_count := v_count + 1;
      ELSE
        -- For older lots, just log (don't delete historical records)
        RAISE NOTICE 'Deposit lot % for seller % is no longer required but keeping for history', 
          v_lot.id, v_lot.seller_id;
      END IF;
    END IF;
  END LOOP;

  -- Re-enable payment for sellers whose deposit lots were cleaned
  -- This is done by checking if seller has any 'required' lots left
  FOR v_lot IN
    SELECT DISTINCT seller_id
    FROM seller_deposit_lots
    WHERE status = 'required'
  LOOP
    -- Check if seller still needs deposit
    SELECT 
      requires_deposit
    INTO v_deposit_check
    FROM check_seller_deposit_requirement(v_lot.seller_id, 0, 'USD')
    LIMIT 1;

    -- If no longer required, re-enable payment
    IF NOT v_deposit_check.requires_deposit THEN
      PERFORM enable_seller_payment(v_lot.seller_id);
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, v_cleaned_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION cleanup_invalid_deposit_lots() IS 
  'Cleans up invalid deposit_lots records that are no longer required. Re-checks deposit requirements and removes/updates lots that are no longer needed.';
