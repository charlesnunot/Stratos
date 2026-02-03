-- 添加 product_comment 到 reports.reported_type 以支持商品评论举报
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_reported_type_check;

ALTER TABLE reports
  ADD CONSTRAINT reports_reported_type_check
  CHECK (reported_type IN (
    'post', 'product', 'user', 'comment', 'product_comment',
    'order', 'affiliate_post', 'tip', 'message'
  ));
