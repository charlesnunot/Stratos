-- Migration: Seller Promotion Priority System
-- Description: Priority display and promotion features for Growth and Scale tier sellers
-- Tier: Growth ($50) and Scale ($100)

-- 1. 创建卖家推广权重表
CREATE TABLE IF NOT EXISTS seller_promotion_weights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 权重配置
  search_boost DECIMAL(3,2) DEFAULT 1.00, -- 搜索排名提升倍数
  feed_priority INTEGER DEFAULT 0, -- 信息流优先级 (0-100)
  homepage_featured BOOLEAN DEFAULT false, -- 是否首页推荐
  
  -- 推广状态
  is_promotion_active BOOLEAN DEFAULT true,
  promotion_expires_at TIMESTAMPTZ,
  
  -- 统计
  featured_count INTEGER DEFAULT 0, -- 被推荐次数
  boosted_views INTEGER DEFAULT 0, -- 加权曝光次数
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(seller_id)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_promotion_weights_seller ON seller_promotion_weights(seller_id);
CREATE INDEX IF NOT EXISTS idx_promotion_weights_priority ON seller_promotion_weights(feed_priority DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_weights_featured ON seller_promotion_weights(homepage_featured) WHERE homepage_featured = true;

-- 3. 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_promotion_weights_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_promotion_weights_timestamp ON seller_promotion_weights;
CREATE TRIGGER update_promotion_weights_timestamp
  BEFORE UPDATE ON seller_promotion_weights
  FOR EACH ROW
  EXECUTE FUNCTION update_promotion_weights_timestamp();

-- 4. 创建函数：计算卖家推广权重
CREATE OR REPLACE FUNCTION calculate_seller_promotion_weight(p_seller_id UUID)
RETURNS TABLE (
  search_boost DECIMAL,
  feed_priority INTEGER,
  can_feature BOOLEAN
) AS $$
DECLARE
  v_seller_type TEXT;
  v_subscription_tier INTEGER;
  v_is_active BOOLEAN;
BEGIN
  -- 获取卖家类型
  SELECT seller_type INTO v_seller_type
  FROM profiles
  WHERE id = p_seller_id;
  
  -- 直营卖家获得最高权重
  IF v_seller_type = 'direct' THEN
    RETURN QUERY SELECT 1.50::DECIMAL, 100::INTEGER, true::BOOLEAN;
    RETURN;
  END IF;
  
  -- 获取订阅信息
  SELECT s.subscription_tier, s.status = 'active' AND s.expires_at > NOW()
  INTO v_subscription_tier, v_is_active
  FROM subscriptions s
  WHERE s.user_id = p_seller_id
    AND s.subscription_type = 'seller'
  ORDER BY s.expires_at DESC
  LIMIT 1;
  
  -- 根据档位设置权重
  IF v_is_active THEN
    CASE v_subscription_tier
      WHEN 100 THEN -- Scale
        RETURN QUERY SELECT 1.30::DECIMAL, 80::INTEGER, true::BOOLEAN;
      WHEN 50 THEN -- Growth
        RETURN QUERY SELECT 1.15::DECIMAL, 50::INTEGER, false::BOOLEAN;
      ELSE -- Starter 或其他
        RETURN QUERY SELECT 1.00::DECIMAL, 0::INTEGER, false::BOOLEAN;
    END CASE;
  ELSE
    RETURN QUERY SELECT 1.00::DECIMAL, 0::INTEGER, false::BOOLEAN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 创建函数：更新卖家推广权重
CREATE OR REPLACE FUNCTION update_seller_promotion_weight(p_seller_id UUID)
RETURNS VOID AS $$
DECLARE
  v_weight RECORD;
BEGIN
  -- 计算权重
  SELECT * INTO v_weight FROM calculate_seller_promotion_weight(p_seller_id);
  
  -- 插入或更新
  INSERT INTO seller_promotion_weights (
    seller_id, 
    search_boost, 
    feed_priority, 
    is_promotion_active,
    promotion_expires_at
  )
  VALUES (
    p_seller_id,
    v_weight.search_boost,
    v_weight.feed_priority,
    v_weight.feed_priority > 0,
    CASE 
      WHEN v_weight.feed_priority > 0 THEN 
        (SELECT expires_at FROM subscriptions 
         WHERE user_id = p_seller_id 
         AND subscription_type = 'seller' 
         AND status = 'active'
         ORDER BY expires_at DESC LIMIT 1)
      ELSE NULL
    END
  )
  ON CONFLICT (seller_id) 
  DO UPDATE SET
    search_boost = EXCLUDED.search_boost,
    feed_priority = EXCLUDED.feed_priority,
    is_promotion_active = EXCLUDED.is_promotion_active,
    promotion_expires_at = EXCLUDED.promotion_expires_at,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建视图：带推广权重的商品列表
CREATE OR REPLACE VIEW products_with_promotion AS
SELECT 
  p.*,
  COALESCE(spw.search_boost, 1.00) as search_boost,
  COALESCE(spw.feed_priority, 0) as feed_priority,
  COALESCE(spw.homepage_featured, false) as homepage_featured,
  pr.seller_type,
  s.subscription_tier
FROM products p
JOIN profiles pr ON pr.id = p.seller_id
LEFT JOIN seller_promotion_weights spw ON spw.seller_id = p.seller_id
LEFT JOIN subscriptions s ON s.user_id = p.seller_id 
  AND s.subscription_type = 'seller'
  AND s.status = 'active'
  AND s.expires_at > NOW();

-- 7. 创建函数：获取优先展示的商品
CREATE OR REPLACE FUNCTION get_priority_products(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF products_with_promotion AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM products_with_promotion
  WHERE status = 'active'
  ORDER BY 
    feed_priority DESC,
    homepage_featured DESC,
    created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 创建触发器：订阅变更时自动更新权重
CREATE OR REPLACE FUNCTION on_subscription_change_update_weight()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_seller_promotion_weight(NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscription_change_update_weight ON subscriptions;
CREATE TRIGGER subscription_change_update_weight
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (NEW.subscription_type = 'seller')
  EXECUTE FUNCTION on_subscription_change_update_weight();

-- 9. 添加RLS策略
ALTER TABLE seller_promotion_weights ENABLE ROW LEVEL SECURITY;

-- 卖家可以查看自己的权重
CREATE POLICY "sellers_can_view_own_promotion_weight"
  ON seller_promotion_weights
  FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

-- 管理员可以管理所有权重
CREATE POLICY "admins_can_manage_promotion_weights"
  ON seller_promotion_weights
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (role = 'admin' OR role = 'support')
    )
  );

-- 10. 添加注释
COMMENT ON TABLE seller_promotion_weights IS '卖家推广权重表 - Growth/Scale档位功能';
COMMENT ON COLUMN seller_promotion_weights.search_boost IS '搜索排名提升倍数';
COMMENT ON COLUMN seller_promotion_weights.feed_priority IS '信息流优先级 (0-100)';
