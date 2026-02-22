-- Create view_history table for tracking user browsing history
-- Stores posts and products that users have viewed

CREATE TABLE IF NOT EXISTS view_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'product')),
  item_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_view_history_user_id ON view_history(user_id);
CREATE INDEX IF NOT EXISTS idx_view_history_item_type_id ON view_history(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_view_history_viewed_at ON view_history(viewed_at DESC);

-- Enable RLS
ALTER TABLE view_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own view history
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'view_history' AND policyname = 'Users can view own view history') THEN
    CREATE POLICY "Users can view own view history" ON view_history
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Users can insert their own view history
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'view_history' AND policyname = 'Users can insert own view history') THEN
    CREATE POLICY "Users can insert own view history" ON view_history
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Users can delete their own view history
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'view_history' AND policyname = 'Users can delete own view history') THEN
    CREATE POLICY "Users can delete own view history" ON view_history
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add comments
COMMENT ON TABLE view_history IS 'User browsing history for posts and products';
COMMENT ON COLUMN view_history.user_id IS 'The user who viewed the item';
COMMENT ON COLUMN view_history.item_type IS 'Type of item: post or product';
COMMENT ON COLUMN view_history.item_id IS 'ID of the post or product';
COMMENT ON COLUMN view_history.viewed_at IS 'When the item was viewed (updated on re-view)';
