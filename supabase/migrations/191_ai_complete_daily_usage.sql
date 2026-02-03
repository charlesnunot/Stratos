-- 非 translate_message 任务的每日限频：每用户每天最多 50 次（extract_topics / translate_* / suggest_category）
-- 用于 /api/ai/complete 除 translate_message 外的 task

CREATE TABLE IF NOT EXISTS ai_complete_daily_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT count_non_negative CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_complete_daily_usage_user_date
  ON ai_complete_daily_usage (user_id, usage_date);

ALTER TABLE ai_complete_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai complete usage"
  ON ai_complete_daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE ai_complete_daily_usage IS 'Daily AI complete (non-translate_message) usage per user, limit 50/day';
