-- 限制 seller_feedbacks INSERT：仅允许为本人作为买家的订单创建反馈，防止为他人订单伪造评价

DROP POLICY IF EXISTS "Buyers can create their own feedback" ON seller_feedbacks;

CREATE POLICY "Buyers can create feedback for own orders only"
  ON seller_feedbacks
  FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_id
        AND o.buyer_id = auth.uid()
    )
  );

COMMENT ON POLICY "Buyers can create feedback for own orders only" ON seller_feedbacks IS
  'Buyer can only insert feedback for orders where they are the buyer (order_id in orders and orders.buyer_id = auth.uid()).';
