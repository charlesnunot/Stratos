-- 卖家基础推广工具
-- 优惠券系统 - 仅Growth和Scale档位可用

-- 1. 创建优惠券表
CREATE TABLE IF NOT EXISTS seller_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL, -- 优惠券标题
  description TEXT, -- 描述
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping')) NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL, -- 折扣值（百分比或固定金额）
  min_order_amount DECIMAL(10,2), -- 最低订单金额
  max_discount_amount DECIMAL(10,2), -- 最大折扣金额（百分比折扣时有效）
  max_uses INTEGER, -- 最大使用次数（全局）
  max_uses_per_user INTEGER DEFAULT 1, -- 每个用户最大使用次数
  used_count INTEGER DEFAULT 0, -- 已使用次数
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  applicable_products UUID[], -- 适用的商品ID列表，NULL表示所有商品
  excluded_products UUID[], -- 排除的商品ID列表
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(seller_id, code)
);

-- 2. 创建优惠券使用记录表
CREATE TABLE IF NOT EXISTS coupon_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID REFERENCES seller_coupons(id),
  user_id UUID REFERENCES profiles(id),
  order_id UUID REFERENCES orders(id),
  discount_amount DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 在orders表添加优惠券字段
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES seller_coupons(id),
ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10,2) DEFAULT 0;

-- 4. 创建函数：验证优惠券
CREATE OR REPLACE FUNCTION validate_coupon(
  p_coupon_code TEXT,
  p_seller_id UUID,
  p_user_id UUID,
  p_order_amount DECIMAL,
  p_product_ids UUID[]
)
RETURNS TABLE (
  is_valid BOOLEAN,
  coupon_id UUID,
  discount_amount DECIMAL(10,2),
  error_message TEXT
) AS $$
DECLARE
  v_coupon RECORD;
  v_user_usage_count INTEGER;
  v_discount DECIMAL(10,2);
BEGIN
  -- 查找优惠券
  SELECT * INTO v_coupon
  FROM seller_coupons
  WHERE code = p_coupon_code
    AND seller_id = p_seller_id
    AND is_active = true;

  IF v_coupon IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '优惠券不存在'::TEXT;
    RETURN;
  END IF;

  -- 检查有效期
  IF v_coupon.valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '优惠券尚未生效'::TEXT;
    RETURN;
  END IF;

  IF v_coupon.valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '优惠券已过期'::TEXT;
    RETURN;
  END IF;

  -- 检查全局使用次数
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '优惠券已达到使用上限'::TEXT;
    RETURN;
  END IF;

  -- 检查用户使用次数
  SELECT COUNT(*) INTO v_user_usage_count
  FROM coupon_usages
  WHERE coupon_id = v_coupon.id AND user_id = p_user_id;

  IF v_user_usage_count >= v_coupon.max_uses_per_user THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '您已达到该优惠券使用次数上限'::TEXT;
    RETURN;
  END IF;

  -- 检查最低订单金额
  IF v_coupon.min_order_amount IS NOT NULL AND p_order_amount < v_coupon.min_order_amount THEN
    RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, 
      '订单金额未达到优惠券使用门槛（最低 ' || v_coupon.min_order_amount || '）'::TEXT;
    RETURN;
  END IF;

  -- 检查适用商品
  IF v_coupon.applicable_products IS NOT NULL AND array_length(v_coupon.applicable_products, 1) > 0 THEN
    IF NOT p_product_ids && v_coupon.applicable_products THEN
      RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '该优惠券不适用于您的商品'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 检查排除商品
  IF v_coupon.excluded_products IS NOT NULL AND array_length(v_coupon.excluded_products, 1) > 0 THEN
    IF p_product_ids && v_coupon.excluded_products THEN
      RETURN QUERY SELECT false, NULL::UUID, 0::DECIMAL, '您的商品中包含该优惠券排除的商品'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 计算折扣金额
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := p_order_amount * (v_coupon.discount_value / 100);
    IF v_coupon.max_discount_amount IS NOT NULL THEN
      v_discount := LEAST(v_discount, v_coupon.max_discount_amount);
    END IF;
  ELSIF v_coupon.discount_type = 'fixed_amount' THEN
    v_discount := LEAST(v_coupon.discount_value, p_order_amount);
  ELSIF v_coupon.discount_type = 'free_shipping' THEN
    v_discount := 0; -- 免邮费，需要在订单中单独处理
  END IF;

  RETURN QUERY SELECT true, v_coupon.id, v_discount, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 创建函数：应用优惠券
CREATE OR REPLACE FUNCTION apply_coupon(
  p_coupon_id UUID,
  p_order_id UUID,
  p_user_id UUID,
  p_discount_amount DECIMAL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- 记录优惠券使用
  INSERT INTO coupon_usages (coupon_id, user_id, order_id, discount_amount)
  VALUES (p_coupon_id, p_user_id, p_order_id, p_discount_amount);

  -- 更新优惠券使用次数
  UPDATE seller_coupons
  SET used_count = used_count + 1
  WHERE id = p_coupon_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建视图：优惠券统计
CREATE OR REPLACE VIEW seller_coupon_stats AS
SELECT 
  sc.id,
  sc.seller_id,
  sc.code,
  sc.title,
  sc.discount_type,
  sc.discount_value,
  sc.is_active,
  sc.valid_from,
  sc.valid_until,
  sc.max_uses,
  sc.used_count,
  COUNT(cu.id) as total_usages,
  COALESCE(SUM(cu.discount_amount), 0) as total_discount_given,
  COUNT(DISTINCT cu.user_id) as unique_users
FROM seller_coupons sc
LEFT JOIN coupon_usages cu ON cu.coupon_id = sc.id
GROUP BY sc.id, sc.seller_id, sc.code, sc.title, sc.discount_type, sc.discount_value, 
         sc.is_active, sc.valid_from, sc.valid_until, sc.max_uses, sc.used_count;

-- 7. 添加索引
CREATE INDEX IF NOT EXISTS idx_seller_coupons_seller_id ON seller_coupons(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_coupons_code ON seller_coupons(code);
CREATE INDEX IF NOT EXISTS idx_seller_coupons_is_active ON seller_coupons(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seller_coupons_valid_dates ON seller_coupons(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_id ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_user_id ON coupon_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id ON orders(coupon_id);

-- 8. 添加RLS策略
ALTER TABLE seller_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;

-- seller_coupons: 卖家可以管理自己的优惠券，Admin可以查看所有
CREATE POLICY seller_coupons_owner_select ON seller_coupons
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY seller_coupons_owner_all ON seller_coupons
  FOR ALL TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY seller_coupons_admin_select ON seller_coupons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- coupon_usages: 卖家可以查看自己优惠券的使用记录
CREATE POLICY coupon_usages_seller_select ON coupon_usages
  FOR SELECT TO authenticated
  USING (
    coupon_id IN (SELECT id FROM seller_coupons WHERE seller_id = auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 9. 创建触发器：更新updated_at
CREATE OR REPLACE FUNCTION update_seller_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_seller_coupons_updated_at ON seller_coupons;
CREATE TRIGGER trigger_update_seller_coupons_updated_at
  BEFORE UPDATE ON seller_coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_coupons_updated_at();
