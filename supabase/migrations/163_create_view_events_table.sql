-- Analytics: 浏览量/访客量统计（PV/UV）
-- 每条记录表示一次浏览；PV = count(*), UV = count(distinct viewer_id) + count(distinct session_id where viewer_id is null)

CREATE TABLE IF NOT EXISTS view_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('post', 'product', 'profile')),
  entity_id UUID NOT NULL,
  viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_view_events_entity ON view_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_view_events_owner_time ON view_events(owner_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_view_events_viewed_at ON view_events(viewed_at DESC);

ALTER TABLE view_events ENABLE ROW LEVEL SECURITY;

-- 任何人（含匿名）可插入一条浏览记录
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'view_events' AND policyname = 'Allow insert view_events') THEN
    CREATE POLICY "Allow insert view_events" ON view_events
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 仅内容所有者可查询自己内容的浏览数据
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'view_events' AND policyname = 'Owners can select own view_events') THEN
    CREATE POLICY "Owners can select own view_events" ON view_events
      FOR SELECT USING (auth.uid() = owner_id);
  END IF;
END $$;

COMMENT ON TABLE view_events IS 'Page view events for posts, products, and profiles (PV/UV analytics)';
COMMENT ON COLUMN view_events.entity_type IS 'post | product | profile';
COMMENT ON COLUMN view_events.entity_id IS 'ID of the post, product, or profile';
COMMENT ON COLUMN view_events.viewer_id IS 'Logged-in user who viewed; null if anonymous';
COMMENT ON COLUMN view_events.session_id IS 'Anonymous session id (cookie) for UV dedup';
COMMENT ON COLUMN view_events.owner_id IS 'Content owner: post author, product seller, or profile user';
