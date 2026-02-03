-- Add user notifications when subscriptions expire
-- Spec: subscription-lifecycle 应通知用户 notifications.insert(user_id, type='subscription_status_changed', resourceId=subId)

CREATE OR REPLACE FUNCTION expire_subscriptions_and_sync_profiles()
RETURNS TABLE (
  expired_count INT,
  affected_user_ids UUID[]
) AS $$
DECLARE
  v_expired_sub RECORD;
  v_affected_users UUID[] := ARRAY[]::UUID[];
  v_count INT := 0;
  v_sub_type_text TEXT;
BEGIN
  -- Process each expired subscription individually (to send notifications before bulk operations)
  FOR v_expired_sub IN
    SELECT id, user_id, subscription_type
    FROM subscriptions
    WHERE status = 'active'
      AND expires_at < NOW()
    FOR UPDATE
  LOOP
    -- Update this subscription to expired
    UPDATE subscriptions
    SET status = 'expired'
    WHERE id = v_expired_sub.id;

    v_count := v_count + 1;
    v_affected_users := array_append(v_affected_users, v_expired_sub.user_id);

    -- Sync profile for this user
    PERFORM sync_profile_subscription_derived(v_expired_sub.user_id);

    -- Notify user (spec: subscription_status_changed, resourceId=subId)
    v_sub_type_text := COALESCE(v_expired_sub.subscription_type, 'subscription');
    INSERT INTO notifications (
      user_id,
      type,
      title,
      content,
      related_id,
      related_type,
      link,
      content_key,
      content_params
    ) VALUES (
      v_expired_sub.user_id,
      'system',
      '订阅已过期',
      '您的' || v_sub_type_text || '订阅已过期，相关权限已更新。',
      v_expired_sub.id,
      'subscription',
      CASE 
        WHEN v_expired_sub.subscription_type = 'seller' THEN '/subscription/seller'
        WHEN v_expired_sub.subscription_type = 'affiliate' THEN '/subscription/affiliate'
        WHEN v_expired_sub.subscription_type = 'tip' THEN '/subscription/tip'
        ELSE '/subscription'
      END,
      'subscription_status_changed',
      jsonb_build_object('subscriptionId', v_expired_sub.id, 'status', 'expired')
    );
  END LOOP;

  -- Deduplicate affected users for return
  IF array_length(v_affected_users, 1) > 0 THEN
    SELECT ARRAY_AGG(DISTINCT u) INTO v_affected_users
    FROM unnest(v_affected_users) AS u;
  END IF;

  RETURN QUERY SELECT v_count, COALESCE(v_affected_users, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION expire_subscriptions_and_sync_profiles IS 'Expire subscriptions that have passed their expires_at date, sync affected profiles, and notify users. Called by cron job daily.';
