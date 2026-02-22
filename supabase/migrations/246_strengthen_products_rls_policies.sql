-- 强化 products RLS 策略
-- 目标：阻止卖家自审 + 校验订阅过期

-- 删除现有的 products RLS 策略
DROP POLICY IF EXISTS "Sellers can create products" ON products;
DROP POLICY IF EXISTS "Sellers can update own products" ON products;

-- 重建插入策略：添加订阅过期校验
CREATE POLICY "Sellers can create products" ON products
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id 
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND subscription_type = 'seller'
      AND subscription_expires_at > now()
    )
  );

-- 创建卖家更新策略：限制只能更新 draft/pending 状态，且不能修改 reviewed_by/reviewed_at
CREATE POLICY "Sellers can update own products" ON products
  FOR UPDATE USING (auth.uid() = seller_id)
  WITH CHECK (
    auth.uid() = seller_id 
    AND status IN ('draft', 'pending')
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

-- 创建管理员更新策略：允许所有更新
CREATE POLICY "Admins can update products" ON products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'support')
    )
  )
  WITH CHECK (true);
