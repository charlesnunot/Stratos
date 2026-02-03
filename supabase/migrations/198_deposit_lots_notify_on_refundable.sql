-- Add seller notifications when deposit lots transition to refundable status
-- Spec: update-deposit-lots-status 应通知卖家 notifications.insert(user_id, type='deposit_status_updated', resourceId=lotId)

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
      
      -- Notify seller (spec: deposit_status_updated, resourceId=lotId)
      INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        related_type,
        link,
        content_key,
        content_params
      ) VALUES (
        v_lot.seller_id,
        'system',
        '保证金可退款',
        '您的保证金 lot 已满足退款条件，状态已更新为可退款。',
        v_lot.id,
        'deposit_lot',
        '/seller/deposit',
        'deposit_status_updated',
        jsonb_build_object('lotId', v_lot.id)
      );
      
      v_updated_count := v_updated_count + 1;
      v_updated_lot_ids := array_append(v_updated_lot_ids, v_lot.id);
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, v_updated_lot_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_deposit_lots_to_refundable() IS 'Updates deposit lots from held to refundable status when conditions are met. Notifies sellers. Called by cron job daily.';
