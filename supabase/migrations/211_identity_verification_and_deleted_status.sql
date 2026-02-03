-- 1. Add 'deleted' to profiles.status for account deletion (soft delete)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'banned', 'suspended', 'deleted'));

COMMENT ON COLUMN profiles.status IS 'User account status: active, banned, suspended, deleted (user requested account closure)';

-- 2. Identity verification (real-name verification) - one row per user, latest submission
CREATE TABLE IF NOT EXISTS identity_verifications (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  real_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejected_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

-- User can view own verification status and submit (insert) or resubmit (update when pending/rejected)
CREATE POLICY "Users can view own identity verification"
  ON identity_verifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can submit identity verification"
  ON identity_verifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own when pending or rejected"
  ON identity_verifications FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('pending', 'rejected'))
  WITH CHECK (auth.uid() = user_id);

-- Admin/support can view and update (for review) - use existing admin role check
CREATE POLICY "Admins can manage identity verifications"
  ON identity_verifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'support')
    )
  );

CREATE TRIGGER identity_verifications_updated_at
  BEFORE UPDATE ON identity_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

COMMENT ON TABLE identity_verifications IS 'Real-name (identity) verification submissions; status reviewed by admin.';
