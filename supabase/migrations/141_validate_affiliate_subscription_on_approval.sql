-- Validate affiliate subscription when post is approved
-- This trigger checks if the affiliate has an active subscription before approving affiliate posts

CREATE OR REPLACE FUNCTION validate_affiliate_subscription_on_post_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_affiliate_id UUID;
  v_has_subscription BOOLEAN;
BEGIN
  -- Only check when status changes from 'pending' to 'approved'
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    -- Check if this post is an affiliate post
    SELECT affiliate_id INTO v_affiliate_id
    FROM affiliate_posts
    WHERE post_id = NEW.id
    LIMIT 1;

    -- If this is an affiliate post, verify subscription
    IF v_affiliate_id IS NOT NULL THEN
      -- Check if affiliate has active subscription
      SELECT check_subscription_status(
        v_affiliate_id,
        'affiliate',
        NULL
      ) INTO v_has_subscription;

      -- If no active subscription, reject the approval
      IF NOT v_has_subscription THEN
        RAISE EXCEPTION 'Cannot approve affiliate post: Affiliate does not have an active subscription. Affiliate ID: %', v_affiliate_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to validate subscription on post approval
DROP TRIGGER IF EXISTS trigger_validate_affiliate_subscription_on_approval ON posts;
CREATE TRIGGER trigger_validate_affiliate_subscription_on_approval
  BEFORE UPDATE OF status ON posts
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'approved')
  EXECUTE FUNCTION validate_affiliate_subscription_on_post_approval();
