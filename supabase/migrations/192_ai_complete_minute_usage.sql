-- 非 translate_message 任务的每分钟限频：每用户每分钟最多 5 次
-- 用于 /api/ai/complete 除 translate_message 外的 task

CREATE TABLE IF NOT EXISTS ai_complete_minute_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  minute_ts BIGINT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, minute_ts),
  CONSTRAINT minute_count_non_negative CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_complete_minute_usage_minute_ts
  ON ai_complete_minute_usage (minute_ts);

COMMENT ON TABLE ai_complete_minute_usage IS 'Per-minute AI complete (non-translate_message) usage, limit 5/min per user';

-- RLS: 仅服务端（admin）读写，用户不可直接访问
ALTER TABLE ai_complete_minute_usage ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_complete_minute_usage' AND policyname = 'Service role only for ai_complete_minute_usage') THEN
    CREATE POLICY "Service role only for ai_complete_minute_usage"
      ON ai_complete_minute_usage
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
