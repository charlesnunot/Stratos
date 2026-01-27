-- Create a public view for profiles that only exposes safe, public fields
-- This provides an additional layer of security beyond RLS policies
-- ✅ 修复 P0: 限制敏感字段访问

CREATE OR REPLACE VIEW public_profiles AS
SELECT 
  id,
  username,
  display_name,
  avatar_url,
  bio,
  location,
  follower_count,
  following_count,
  created_at
FROM profiles;

-- Grant SELECT access to authenticated and anon users
GRANT SELECT ON public_profiles TO authenticated, anon;

-- Add comment
COMMENT ON VIEW public_profiles IS 'Public view of profiles with only safe, non-sensitive fields. Excludes: email, payment_account_id, subscription_type, subscription_expires_at, payment_provider, provider_charges_enabled, provider_payouts_enabled, provider_account_status, seller_payout_eligibility, role, status, etc.';
