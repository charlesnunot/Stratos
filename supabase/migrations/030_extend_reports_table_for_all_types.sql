-- 扩展 reports 表的 reported_type 字段约束
-- 支持所有举报类型：post, product, user, comment, order, affiliate_post, tip, message

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_reported_type_check;

ALTER TABLE reports
  ADD CONSTRAINT reports_reported_type_check 
  CHECK (reported_type IN ('post', 'product', 'user', 'comment', 'order', 'affiliate_post', 'tip', 'message'));
