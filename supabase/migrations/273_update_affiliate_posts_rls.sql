-- 更新 affiliate_posts 的 RLS 策略
-- 使其与 SubscriptionContext 中的逻辑一致

-- 删除旧的策略
DROP POLICY IF EXISTS "Affiliates can create affiliate posts" ON affiliate_posts;

-- 创建新的策略：检查 affiliate_subscription_active 或 internal_affiliate_enabled
CREATE POLICY "Affiliates can create affiliate posts" ON affiliate_posts
  FOR INSERT WITH CHECK (
    auth.uid() = affiliate_id AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND (
        affiliate_subscription_active = true
        OR internal_affiliate_enabled = true
        OR subscription_type = 'affiliate'
      )
    )
  );

-- 添加注释
COMMENT ON POLICY "Affiliates can create affiliate posts" ON affiliate_posts IS 
  '用户必须有带货订阅权限才能创建 affiliate_posts 记录';
