-- Add dispute timeout handling functions
-- This migration creates functions for automatically escalating disputes
-- when sellers don't respond within the timeout period

-- Function to auto-escalate disputes that have timed out
-- Disputes that are pending for more than 48 hours are automatically escalated to platform review
CREATE OR REPLACE FUNCTION auto_escalate_disputes()
RETURNS TABLE (
  escalated_count INT,
  escalated_disputes UUID[]
) AS $$
DECLARE
  v_dispute RECORD;
  v_count INT := 0;
  v_dispute_ids UUID[] := ARRAY[]::UUID[];
  v_order_number TEXT;
BEGIN
  -- Find all disputes that have been pending for more than 48 hours
  -- and haven't been responded to by the seller
  FOR v_dispute IN
    SELECT id, order_id, initiated_by, initiated_by_type
    FROM order_disputes
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '48 hours'
      AND seller_responded_at IS NULL
    FOR UPDATE
  LOOP
    -- Get order number for notification
    SELECT COALESCE(order_number, id::TEXT) INTO v_order_number
    FROM orders
    WHERE id = v_dispute.order_id;

    -- Update dispute status to reviewing
    UPDATE order_disputes
    SET 
      status = 'reviewing',
      updated_at = NOW()
    WHERE id = v_dispute.id;

    -- Create notification for admin (notify all admins)
    INSERT INTO notifications (
      user_id,
      type,
      title,
      content,
      related_type,
      related_id,
      link
    )
    SELECT 
      id,
      'system',
      '争议超时自动升级',
      format('订单 %s 的争议已超过48小时未响应，已自动进入平台审核', v_order_number),
      'order',
      v_dispute.order_id,
      format('/admin/disputes/%s', v_dispute.id)
    FROM profiles
    WHERE role = 'admin';

    v_count := v_count + 1;
    v_dispute_ids := array_append(v_dispute_ids, v_dispute.id);
  END LOOP;

  RETURN QUERY SELECT
    v_count,
    v_dispute_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for efficient timeout queries
CREATE INDEX IF NOT EXISTS idx_order_disputes_timeout 
  ON order_disputes(status, created_at) 
  WHERE status = 'pending' AND seller_responded_at IS NULL;
