-- Add favorite_count fields to posts and products tables
-- This improves performance by caching favorite counts instead of querying favorites table every time

-- Add favorite_count to posts table
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS favorite_count INT DEFAULT 0;

-- Add favorite_count to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS favorite_count INT DEFAULT 0;

-- Add index for better query performance (if needed for sorting/filtering)
CREATE INDEX IF NOT EXISTS idx_posts_favorite_count ON posts(favorite_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_favorite_count ON products(favorite_count DESC);
