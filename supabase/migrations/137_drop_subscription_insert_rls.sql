-- Drop RLS policy that allows users to create their own subscriptions
-- This migration addresses Risk 2: prevent frontend from directly inserting subscriptions
-- All subscription creation must go through backend API for validation

-- Drop the "Users can create own subscriptions" policy
DROP POLICY IF EXISTS "Users can create own subscriptions" ON subscriptions;

-- Comment: From now on, only service role (backend API) can insert subscriptions
-- Frontend must use /api/subscriptions/create-pending API instead
