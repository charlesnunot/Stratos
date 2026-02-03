-- Admin / critical action audit log (persistent, queryable)
-- Used by logAudit() for ban/unban, content-review, refund, dispute, etc.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resource_id UUID,
  resource_type TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'fail', 'forbidden')),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- No permissive policy: only service role can insert/select (RLS bypass with service_role)
-- Authenticated/anonymous cannot read or write audit_log
COMMENT ON TABLE audit_log IS 'Admin and critical action audit trail. Only service role access. Query by user_id, resource_id, action, created_at.';
