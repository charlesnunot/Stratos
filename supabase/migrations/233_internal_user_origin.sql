-- Internal users: system principals for cold start, testing, automation.
-- Not a business role; orthogonal to role and seller_type. Never exposed as internal to public.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_origin TEXT
  CHECK (user_origin IN ('external', 'internal'))
  DEFAULT 'external';

CREATE INDEX IF NOT EXISTS idx_profiles_user_origin ON profiles(user_origin) WHERE user_origin IS NOT NULL;

COMMENT ON COLUMN profiles.user_origin IS 'Origin: external (registered users) or internal (system-generated principals for cold start/testing/automation). Internal users are never exposed as internal to buyers or public; admin and logs only.';
