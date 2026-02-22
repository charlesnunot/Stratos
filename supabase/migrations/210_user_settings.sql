-- User settings: privacy, notification preferences (one row per user)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Privacy
  profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'followers', 'private')),
  who_can_message TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_message IN ('everyone', 'followers', 'nobody')),
  who_can_comment TEXT NOT NULL DEFAULT 'everyone' CHECK (who_can_comment IN ('everyone', 'followers', 'nobody')),
  -- Notifications (in-app notifications are always created; these control email/push preferences)
  email_messages BOOLEAN NOT NULL DEFAULT true,
  email_likes BOOLEAN NOT NULL DEFAULT true,
  email_comments BOOLEAN NOT NULL DEFAULT true,
  email_follows BOOLEAN NOT NULL DEFAULT true,
  email_orders BOOLEAN NOT NULL DEFAULT true,
  email_marketing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: users can only read/update their own settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can view own settings') THEN
    CREATE POLICY "Users can view own settings"
      ON user_settings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can insert own settings') THEN
    CREATE POLICY "Users can insert own settings"
      ON user_settings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can update own settings') THEN
    CREATE POLICY "Users can update own settings"
      ON user_settings FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger to keep updated_at
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

COMMENT ON TABLE user_settings IS 'Per-user privacy and notification preferences.';
