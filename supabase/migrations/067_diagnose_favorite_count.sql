-- Comprehensive diagnostic script for favorite_count trigger issue
-- Run this in Supabase SQL Editor to identify the problem

-- ============================================
-- PART 1: Check Trigger Status
-- ============================================
SELECT 
  'Trigger Status' as check_type,
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE tgenabled
    WHEN 'O' THEN 'Enabled'
    WHEN 'D' THEN 'Disabled'
    WHEN 'R' THEN 'Replica'
    WHEN 'A' THEN 'Always'
    ELSE 'Unknown'
  END as trigger_status,
  proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'trigger_update_favorite_count'
  AND tgrelid = 'favorites'::regclass;

-- ============================================
-- PART 2: Check Function Definition
-- ============================================
SELECT 
  'Function Definition' as check_type,
  proname as function_name,
  CASE prosecdef
    WHEN true THEN 'SECURITY DEFINER (can bypass RLS)'
    WHEN false THEN 'SECURITY INVOKER (subject to RLS)'
  END as security_mode,
  pg_get_functiondef(oid) as full_function_definition
FROM pg_proc
WHERE proname = 'update_favorite_count';

-- ============================================
-- PART 3: Check RLS Policies on posts table
-- ============================================
SELECT 
  'RLS Policies on posts' as check_type,
  policyname,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'posts'
  AND cmd = 'UPDATE'
ORDER BY policyname;

-- ============================================
-- PART 4: Check if RLS is enabled on posts
-- ============================================
SELECT 
  'RLS Status' as check_type,
  tablename,
  CASE rowsecurity
    WHEN true THEN 'RLS ENABLED (policies apply)'
    WHEN false THEN 'RLS DISABLED (no policies)'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'posts';

-- ============================================
-- PART 5: Test data matching between favorites and posts
-- ============================================
SELECT 
  'Data Matching Test' as check_type,
  f.id as favorite_id,
  f.item_id::text as favorite_item_id,
  p.id::text as post_id,
  f.item_id::uuid = p.id::uuid as uuid_match,
  p.favorite_count as current_favorite_count,
  (
    SELECT COUNT(*)::INT
    FROM favorites f2
    WHERE f2.item_type = 'post'
      AND f2.item_id::uuid = p.id::uuid
  ) as actual_favorite_count
FROM favorites f
CROSS JOIN posts p
WHERE f.item_type = 'post'
  AND f.item_id::text = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'
  AND p.id::text = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'
LIMIT 1;

-- ============================================
-- PART 6: Count favorites for the specific post
-- ============================================
SELECT 
  'Favorite Count Check' as check_type,
  COUNT(*)::INT as total_favorites_for_post,
  array_agg(id::text) as favorite_ids
FROM favorites
WHERE item_type = 'post'
  AND item_id::uuid = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;

-- ============================================
-- PART 7: Check current favorite_count in posts
-- ============================================
SELECT 
  'Post Current State' as check_type,
  id::text as post_id,
  favorite_count as current_favorite_count,
  (
    SELECT COUNT(*)::INT
    FROM favorites
    WHERE item_type = 'post'
      AND item_id::uuid = posts.id::uuid
  ) as calculated_actual_count,
  CASE 
    WHEN favorite_count = (
      SELECT COUNT(*)::INT
      FROM favorites
      WHERE item_type = 'post'
        AND item_id::uuid = posts.id::uuid
    ) THEN '✓ Match'
    ELSE '✗ Mismatch'
  END as status
FROM posts
WHERE id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;

-- ============================================
-- PART 8: Compare with working trigger (share_count)
-- ============================================
SELECT 
  'Comparison: share_count trigger' as check_type,
  proname as function_name,
  CASE prosecdef
    WHEN true THEN 'SECURITY DEFINER'
    WHEN false THEN 'SECURITY INVOKER'
  END as security_mode
FROM pg_proc
WHERE proname = 'update_item_share_count';

-- ============================================
-- PART 9: Check all triggers on favorites table
-- ============================================
SELECT 
  'All Triggers on favorites' as check_type,
  tgname as trigger_name,
  CASE tgenabled
    WHEN 'O' THEN 'Enabled'
    WHEN 'D' THEN 'Disabled'
    ELSE 'Other'
  END as status,
  proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'favorites'::regclass
ORDER BY tgname;

-- ============================================
-- PART 10: Test if we can manually update (simulating trigger behavior)
-- ============================================
-- This test will show if RLS is blocking updates
-- Note: Run this in a transaction so we can rollback
DO $$
DECLARE
  old_count INT;
  new_count INT;
  rows_updated INT;
BEGIN
  -- Get current count
  SELECT favorite_count INTO old_count
  FROM posts
  WHERE id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;
  
  -- Try to update (this simulates what the trigger does)
  UPDATE posts
  SET favorite_count = favorite_count + 1
  WHERE id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;
  
  -- Check if update succeeded
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  
  IF rows_updated > 0 THEN
    SELECT favorite_count INTO new_count
    FROM posts
    WHERE id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;
    
    -- Rollback the change
    UPDATE posts
    SET favorite_count = old_count
    WHERE id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;
    
    RAISE NOTICE 'Manual update test: SUCCESS - Updated from % to %', old_count, new_count;
  ELSE
    RAISE NOTICE 'Manual update test: FAILED - No rows updated (likely RLS blocking)';
  END IF;
END $$;

-- ============================================
-- PART 11: Check function owner and permissions
-- ============================================
SELECT 
  'Function Permissions' as check_type,
  p.proname as function_name,
  p.proowner::regrole as owner,
  p.prosecdef as is_security_definer,
  p.proacl as access_privileges
FROM pg_proc p
WHERE p.proname IN ('update_favorite_count', 'update_item_share_count', 'update_post_like_count')
ORDER BY p.proname;
