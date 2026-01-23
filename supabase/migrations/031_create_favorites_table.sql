-- 创建 favorites 表，支持多类型内容收藏
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'product', 'user', 'comment', 'order', 'affiliate_post', 'tip', 'message')),
  item_id UUID NOT NULL,
  notes TEXT, -- 用户可选的备注
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id)
);

-- 创建索引以提高查询性能
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_item_type ON favorites(item_type);
CREATE INDEX idx_favorites_item_id ON favorites(item_id);
CREATE INDEX idx_favorites_created_at ON favorites(created_at DESC);

-- 启用 RLS
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的收藏
CREATE POLICY "Users can view own favorites" ON favorites
  FOR SELECT
  USING (auth.uid() = user_id);

-- 用户可以添加自己的收藏
CREATE POLICY "Users can insert own favorites" ON favorites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户可以删除自己的收藏
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- 用户可以更新自己的收藏（主要是备注）
CREATE POLICY "Users can update own favorites" ON favorites
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
