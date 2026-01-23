-- 统一商品状态默认值为 'pending'
-- 确保商品创建后默认状态为 'pending'（待审核），而不是 'draft'

-- 修改 products 表的 status 字段默认值
ALTER TABLE products
  ALTER COLUMN status SET DEFAULT 'pending';

-- 更新现有的 'draft' 状态商品为 'pending'（如果它们还没有被审核）
-- 注意：只更新那些从未被审核过的商品
UPDATE products
SET status = 'pending'
WHERE status = 'draft'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL;

-- 验证默认值已更新
DO $$
DECLARE
  current_default TEXT;
BEGIN
  SELECT column_default INTO current_default
  FROM information_schema.columns
  WHERE table_name = 'products'
    AND column_name = 'status';
  
  -- 检查默认值是否包含 'pending'（column_default 可能返回 'pending'::text 格式）
  -- 使用正则表达式检查是否包含 pending（忽略类型转换部分）
  IF current_default IS NULL OR current_default !~ 'pending' THEN
    RAISE EXCEPTION 'Product status default value was not updated correctly. Current: %', current_default;
  END IF;
  
  RAISE NOTICE 'Product status default value verified: %', current_default;
END $$;
