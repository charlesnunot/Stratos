-- Debug script to investigate favorite_count issue
-- This will help us understand why the JOIN is not matching

-- 1. Check the actual data in favorites table for this post
SELECT 
  id,
  user_id,
  item_type,
  item_id,
  pg_typeof(item_id) as item_id_type,
  item_id::text as item_id_text,
  created_at
FROM favorites
WHERE item_type = 'post'
  AND item_id::text LIKE '%cab4d818-d84a-413f-9228-8ef6b1c79bcb%';

-- 2. Check the post data
SELECT 
  id,
  pg_typeof(id) as id_type,
  id::text as id_text,
  favorite_count
FROM posts
WHERE id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb';

-- 3. Try different JOIN approaches to see which one works
-- Approach 1: Direct comparison
SELECT 
  p.id as post_id,
  f.item_id as favorite_item_id,
  p.id = f.item_id as direct_match,
  p.id::text = f.item_id::text as text_match,
  p.id::uuid = f.item_id::uuid as uuid_match
FROM posts p
CROSS JOIN favorites f
WHERE p.id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'
  AND f.item_type = 'post'
  AND f.item_id::text LIKE '%cab4d818%';

-- 4. Count favorites without JOIN to see if there are any
SELECT 
  COUNT(*) as total_favorites_for_post
FROM favorites
WHERE item_type = 'post'
  AND item_id::uuid = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::uuid;

-- 5. Check all favorites for posts to see the pattern
SELECT 
  item_type,
  item_id,
  pg_typeof(item_id) as item_id_type,
  COUNT(*) as count
FROM favorites
WHERE item_type = 'post'
GROUP BY item_type, item_id, pg_typeof(item_id)
LIMIT 10;
