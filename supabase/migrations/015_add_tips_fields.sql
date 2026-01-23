-- 为 tips 表添加 recipient_id 和 payment_status 字段

-- 添加 recipient_id 字段（接收打赏的用户ID）
ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 添加 payment_status 字段
ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' 
  CHECK (payment_status IN ('pending', 'paid', 'failed'));

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_tips_recipient_id ON tips(recipient_id);
CREATE INDEX IF NOT EXISTS idx_tips_payment_status ON tips(payment_status);

-- 添加注释
COMMENT ON COLUMN tips.recipient_id IS 'User ID who receives the tip (usually the post author)';
COMMENT ON COLUMN tips.payment_status IS 'Payment status of the tip';
