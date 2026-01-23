-- 为带货用户插入订阅数据
-- 用户ID: 6dc26090-716f-49cc-a45c-88a23dbb68fb

-- 首先检查用户是否存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = '6dc26090-716f-49cc-a45c-88a23dbb68fb'
  ) THEN
    RAISE EXCEPTION 'User with id 6dc26090-716f-49cc-a45c-88a23dbb68fb does not exist in profiles table';
  END IF;
END $$;

-- 插入带货订阅（affiliate订阅，状态为 active，30天有效期）
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
  '6dc26090-716f-49cc-a45c-88a23dbb68fb',
  'affiliate',
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
  subscription_type = 'affiliate',
  subscription_expires_at = NOW() + INTERVAL '30 days'
WHERE id = '6dc26090-716f-49cc-a45c-88a23dbb68fb';
