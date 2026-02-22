-- SQL script to check current subscription sync status
-- Run these commands in your Supabase SQL editor

-- 1. Check function existence and definition
SELECT 
    proname as function_name,
    prosrc as function_source
FROM pg_proc 
WHERE proname = 'sync_profile_subscription_derived';

-- 2. Check the specific user's profiles record
SELECT 
    id, 
    subscription_type, 
    subscription_tier, 
    product_limit, 
    role, 
    seller_type,
    seller_subscription_active,
    seller_subscription_expires_at,
    affiliate_subscription_active,
    affiliate_subscription_expires_at,
    tip_subscription_active,
    tip_subscription_expires_at
FROM profiles
WHERE id = '9a4c8b49-0bff-44a6-8380-6312c8f7315d';

-- 3. Check the user's active subscriptions
SELECT 
    id,
    subscription_type,
    status,
    amount,
    subscription_tier,
    product_limit,
    expires_at
FROM subscriptions
WHERE user_id = '9a4c8b49-0bff-44a6-8380-6312c8f7315d'
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();

-- 4. Check if trigger exists
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled
FROM pg_trigger 
WHERE tgname LIKE '%subscription%';

-- 5. Check migration history
SELECT 
    name,
    statements
FROM supabase_migrations.schema_migrations 
WHERE name LIKE '%256%' OR name LIKE '%257%' OR name LIKE '%258%'
ORDER BY name DESC;