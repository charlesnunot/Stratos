-- 添加商品点赞和"想要"功能支持

-- 首先为products表添加统计字段
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS want_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;

-- 创建商品点赞表
CREATE TABLE IF NOT EXISTS product_likes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

-- 创建商品"想要"表
CREATE TABLE IF NOT EXISTS product_wants (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

-- 创建触发器函数：自动更新商品点赞数
CREATE OR REPLACE FUNCTION update_product_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products
    SET like_count = like_count + 1
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 创建商品点赞触发器
DROP TRIGGER IF EXISTS trigger_update_product_like_count ON product_likes;
CREATE TRIGGER trigger_update_product_like_count
  AFTER INSERT OR DELETE ON product_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_product_like_count();

-- 创建触发器函数：自动更新商品"想要"数
CREATE OR REPLACE FUNCTION update_product_want_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products
    SET want_count = want_count + 1
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products
    SET want_count = GREATEST(0, want_count - 1)
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 创建商品"想要"触发器
DROP TRIGGER IF EXISTS trigger_update_product_want_count ON product_wants;
CREATE TRIGGER trigger_update_product_want_count
  AFTER INSERT OR DELETE ON product_wants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_want_count();

-- 启用RLS策略
ALTER TABLE product_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_wants ENABLE ROW LEVEL SECURITY;

-- product_likes表的RLS策略
-- 允许所有人查看
DROP POLICY IF EXISTS "Anyone can view product likes" ON product_likes;
CREATE POLICY "Anyone can view product likes" ON product_likes
  FOR SELECT
  USING (true);

-- 允许认证用户插入自己的点赞
DROP POLICY IF EXISTS "Users can insert their own product likes" ON product_likes;
CREATE POLICY "Users can insert their own product likes" ON product_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 允许用户删除自己的点赞
DROP POLICY IF EXISTS "Users can delete their own product likes" ON product_likes;
CREATE POLICY "Users can delete their own product likes" ON product_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- product_wants表的RLS策略
-- 允许所有人查看
DROP POLICY IF EXISTS "Anyone can view product wants" ON product_wants;
CREATE POLICY "Anyone can view product wants" ON product_wants
  FOR SELECT
  USING (true);

-- 允许认证用户插入自己的"想要"
DROP POLICY IF EXISTS "Users can insert their own product wants" ON product_wants;
CREATE POLICY "Users can insert their own product wants" ON product_wants
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 允许用户删除自己的"想要"
DROP POLICY IF EXISTS "Users can delete their own product wants" ON product_wants;
CREATE POLICY "Users can delete their own product wants" ON product_wants
  FOR DELETE
  USING (auth.uid() = user_id);