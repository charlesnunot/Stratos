-- Add user status field to profiles table
-- This migration adds status management for user accounts (active, banned, suspended)
-- Status: 'active' | 'banned' | 'suspended'

-- ============================================
-- 1. Add status field to profiles table
-- ============================================

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'banned', 'suspended'));

-- Set existing users to active
UPDATE profiles SET status = 'active' WHERE status IS NULL;

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status) 
  WHERE status != 'active';

-- Add comment
COMMENT ON COLUMN profiles.status IS 'User account status: active (normal), banned (permanently disabled), suspended (temporarily disabled)';

-- ============================================
-- 2. Update RLS policies to filter banned users' content
-- ============================================

-- Drop existing posts SELECT policies (both old and new names)
DROP POLICY IF EXISTS "Users can view approved posts" ON posts;
DROP POLICY IF EXISTS "Users can view approved posts from active users" ON posts;

-- Create new policy that filters out posts from banned users
CREATE POLICY "Users can view approved posts from active users" ON posts
  FOR SELECT
  USING (
    (
      status = 'approved' AND 
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = posts.user_id 
        AND profiles.status = 'active'
      )
    ) OR
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'support')
    )
  );

-- Update products policy to filter banned sellers
DROP POLICY IF EXISTS "Users can view active products" ON products;
DROP POLICY IF EXISTS "Users can view active products from active sellers" ON products;

CREATE POLICY "Users can view active products from active sellers" ON products
  FOR SELECT
  USING (
    (
      status = 'active' AND 
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = products.seller_id 
        AND profiles.status = 'active'
      )
    ) OR
    seller_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'support')
    )
  );

-- Update comments policy to filter banned users' comments
DROP POLICY IF EXISTS "Users can view approved comments" ON comments;
DROP POLICY IF EXISTS "Users can view approved comments from active users" ON comments;

CREATE POLICY "Users can view approved comments from active users" ON comments
  FOR SELECT
  USING (
    (
      status = 'approved' AND 
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = comments.user_id 
        AND profiles.status = 'active'
      )
    ) OR
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'support')
    )
  );

-- ============================================
-- 3. Update RLS policies to prevent banned users from creating content
-- ============================================

-- Drop existing INSERT policies and replace with status-aware versions
DROP POLICY IF EXISTS "Users can create posts" ON posts;
DROP POLICY IF EXISTS "Only active users can create posts" ON posts;
CREATE POLICY "Only active users can create posts" ON posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create products" ON products;
DROP POLICY IF EXISTS "Only active users can create products" ON products;
CREATE POLICY "Only active users can create products" ON products
  FOR INSERT
  WITH CHECK (
    auth.uid() = seller_id AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Only active users can create comments" ON comments;
CREATE POLICY "Only active users can create comments" ON comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'active'
    )
  );

-- Update likes policy (drop old if exists, create new)
DROP POLICY IF EXISTS "Users can like posts" ON likes;
DROP POLICY IF EXISTS "Only active users can like" ON likes;
CREATE POLICY "Only active users can like" ON likes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.status = 'active'
    )
  );

-- Note: follows table INSERT policy may not exist in initial schema
-- Create it if needed (will fail gracefully if already exists with different name)
-- Check your existing migrations for follows policies
