-- Block privilege-escalation style updates on sensitive profile columns.
-- Regular users may update their own profile, but cannot mutate identity/authority fields.
-- Admin APIs using service_role remain unaffected.

CREATE OR REPLACE FUNCTION public.prevent_self_update_sensitive_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend/admin writes via service_role are trusted.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- If there is no authenticated user in context, don't block internal flows.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only restrict self-updates. Non-self updates are already controlled by RLS/admin APIs.
  IF auth.uid() <> OLD.id THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.user_origin IS DISTINCT FROM OLD.user_origin
    OR NEW.seller_type IS DISTINCT FROM OLD.seller_type
    OR NEW.internal_tip_enabled IS DISTINCT FROM OLD.internal_tip_enabled
    OR NEW.internal_affiliate_enabled IS DISTINCT FROM OLD.internal_affiliate_enabled
  THEN
    RAISE EXCEPTION 'forbidden profile field update'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_self_update_sensitive_profile_fields() IS
  'Prevents self-service updates to sensitive profile authority fields. Service role bypasses this check.';

DROP TRIGGER IF EXISTS trg_prevent_self_update_sensitive_profile_fields ON public.profiles;
CREATE TRIGGER trg_prevent_self_update_sensitive_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_update_sensitive_profile_fields();
