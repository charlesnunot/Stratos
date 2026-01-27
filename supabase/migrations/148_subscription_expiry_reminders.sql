-- Subscription expiry reminder notifications
-- Sends reminders 3 days and 1 day before subscription expires

CREATE OR REPLACE FUNCTION send_subscription_expiry_reminders()
RETURNS TABLE (
  reminders_3d_sent INT,
  reminders_1d_sent INT
) AS $$
DECLARE
  v_sub RECORD;
  v_type_name TEXT;
  v_days INT;
  v_count_3d INT := 0;
  v_count_1d INT := 0;
BEGIN
  -- 3-day reminder: expires_at between NOW()+3d and NOW()+4d
  FOR v_sub IN
    SELECT s.id, s.user_id, s.subscription_type, s.expires_at
    FROM subscriptions s
    WHERE s.status = 'active'
      AND s.expires_at > NOW()
      AND s.expires_at >= NOW() + INTERVAL '3 days'
      AND s.expires_at < NOW() + INTERVAL '4 days'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.related_id = s.id::TEXT
          AND n.related_type = 'subscription'
          AND n.title = '订阅到期提醒（3天）'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    v_type_name := CASE v_sub.subscription_type
      WHEN 'seller' THEN '卖家'
      WHEN 'affiliate' THEN '带货者'
      WHEN 'tip' THEN '打赏功能'
      ELSE v_sub.subscription_type
    END;
    INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link)
    VALUES (
      v_sub.user_id,
      'system',
      '订阅到期提醒（3天）',
      '您的' || v_type_name || '订阅将在 3 天后到期，请及时续费以继续使用。',
      v_sub.id::TEXT,
      'subscription',
      '/subscription/manage'
    );
    v_count_3d := v_count_3d + 1;
  END LOOP;

  -- 1-day reminder: expires_at between NOW()+1d and NOW()+2d
  FOR v_sub IN
    SELECT s.id, s.user_id, s.subscription_type, s.expires_at
    FROM subscriptions s
    WHERE s.status = 'active'
      AND s.expires_at > NOW()
      AND s.expires_at >= NOW() + INTERVAL '1 day'
      AND s.expires_at < NOW() + INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.related_id = s.id::TEXT
          AND n.related_type = 'subscription'
          AND n.title = '订阅到期提醒（1天）'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    v_type_name := CASE v_sub.subscription_type
      WHEN 'seller' THEN '卖家'
      WHEN 'affiliate' THEN '带货者'
      WHEN 'tip' THEN '打赏功能'
      ELSE v_sub.subscription_type
    END;
    INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link)
    VALUES (
      v_sub.user_id,
      'system',
      '订阅到期提醒（1天）',
      '您的' || v_type_name || '订阅将在 1 天后到期，请及时续费。',
      v_sub.id::TEXT,
      'subscription',
      '/subscription/manage'
    );
    v_count_1d := v_count_1d + 1;
  END LOOP;

  RETURN QUERY SELECT v_count_3d, v_count_1d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION send_subscription_expiry_reminders IS 'Send reminder notifications for subscriptions expiring in 3 days or 1 day. Deduplicated per subscription per day.';
