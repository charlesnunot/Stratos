-- Critical path performance monitoring
-- Stores key user flow timing (checkout, payment, post_create) for performance analysis
-- Spec: 关键路径请求记录到 critical_path_logs

CREATE TABLE IF NOT EXISTS critical_path_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'timeout', 'failed', 'aborted')),
  duration_ms INT,
  meta_keys TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_critical_path_logs_name ON critical_path_logs(name);
CREATE INDEX IF NOT EXISTS idx_critical_path_logs_created_at ON critical_path_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_critical_path_logs_user_id ON critical_path_logs(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE critical_path_logs ENABLE ROW LEVEL SECURITY;

-- No permissive policy: only service role (getSupabaseAdmin) can insert/select (RLS bypass)
-- Regular users cannot read or write; logs are admin-only for performance analysis

COMMENT ON TABLE critical_path_logs IS 'Key user flow performance logs (checkout, payment, post_create). Fire-and-forget, non-blocking. Admin query only.';
