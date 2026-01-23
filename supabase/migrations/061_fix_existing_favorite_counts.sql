-- Fix existing favorite_count values in posts and products tables
-- This migration calculates and updates the correct favorite counts for all existing records

-- Update posts favorite_count based on actual favorites
UPDATE posts
SET favorite_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM favorites
   WHERE favorites.item_type = 'post'
     AND favorites.item_id::UUID = posts.id),
  0
);

-- Update products favorite_count based on actual favorites
UPDATE products
SET favorite_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM favorites
   WHERE favorites.item_type = 'product'
     AND favorites.item_id::UUID = products.id),
  0
);

-- Verify the counts (optional check query)
-- SELECT 
--   'posts' as table_name,
--   COUNT(*) as total_posts,
--   SUM(favorite_count) as total_favorites
-- FROM posts
-- UNION ALL
-- SELECT 
--   'products' as table_name,
--   COUNT(*) as total_products,
--   SUM(favorite_count) as total_favorites
-- FROM products;
