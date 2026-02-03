-- 聊天翻译限频：每用户每天最多 10 条消息翻译
-- 用于 /api/ai/complete task=translate_message 时计数

CREATE TABLE IF NOT EXISTS ai_translation_daily_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  task TEXT NOT NULL DEFAULT 'translate_message',
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT count_non_negative CHECK (count >= 0)
);

-- 便于按用户+日期查询
CREATE INDEX IF NOT EXISTS idx_ai_translation_daily_usage_user_date
  ON ai_translation_daily_usage (user_id, usage_date);

-- RLS：仅允许用户读自己的记录；写入由 service_role 在 API 中完成
ALTER TABLE ai_translation_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON ai_translation_daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- 插入/更新由后端使用 service_role 执行，不开放给 anon/authenticated 写
COMMENT ON TABLE ai_translation_daily_usage IS 'Daily AI translation usage per user for rate limiting (e.g. 10/day for chat)';
