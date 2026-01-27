-- Function to update deposit lots from 'held' to 'refundable'
-- Called by cron job to check and update lot status
-- This addresses Gap 2: held → refundable status transition

CREATE OR REPLACE FUNCTION update_deposit_lots_to_refundable()
RETURNS TABLE (
  updated_count INTEGER,
  updated_lot_ids UUID[]
) AS $$
DECLARE
  v_lot RECORD;
  v_updated_count INTEGER := 0;
  v_updated_lot_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Loop through all 'held' lots
  FOR v_lot IN
    SELECT id, seller_id
    FROM seller_deposit_lots
    WHERE status = 'held'
  LOOP
    -- Check if lot can be refunded
    IF check_deposit_refundable(v_lot.id) THEN
      -- Update lot to refundable
      UPDATE seller_deposit_lots
      SET 
        status = 'refundable',
        refundable_at = NOW() + INTERVAL '3 days',
        updated_at = NOW()
      WHERE id = v_lot.id;
      
      v_updated_count := v_updated_count + 1;
      v_updated_lot_ids := array_append(v_updated_lot_ids, v_lot.id);
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, v_updated_lot_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION update_deposit_lots_to_refundable() IS 'Updates deposit lots from held to refundable status when conditions are met. Called by cron job daily.';
