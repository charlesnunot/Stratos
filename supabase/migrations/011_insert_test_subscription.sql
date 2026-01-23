-- 为测试账户插入测试订阅数据
-- 用户ID: 485b864d-1a38-49ce-b51f-e76fb17afd6c

-- 首先检查用户是否存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = '485b864d-1a38-49ce-b51f-e76fb17afd6c'
  ) THEN
    RAISE EXCEPTION 'User with id 485b864d-1a38-49ce-b51f-e76fb17afd6c does not exist in profiles table';
  END IF;
END $$;

-- 插入测试订阅（卖家订阅，状态为 active，30天有效期）
INSERT INTO subscriptions (
  user_id,
  subscription_type,
  payment_method,
  payment_account_id,
  amount,
  status,
  starts_at,
  expires_at
) VALUES (
  '485b864d-1a38-49ce-b51f-e76fb17afd6c',
  'seller',
  'stripe',
  NULL,
  99.00,
  'active',
  NOW(),
  NOW() + INTERVAL '30 days'
)
ON CONFLICT DO NOTHING;

-- 更新 profiles 表中的订阅信息
UPDATE profiles
SET 
  subscription_type = 'seller',
  subscription_expires_at = NOW() + INTERVAL '30 days'
WHERE id = '485b864d-1a38-49ce-b51f-e76fb17afd6c';
