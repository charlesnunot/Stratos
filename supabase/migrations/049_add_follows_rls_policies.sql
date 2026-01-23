-- Add RLS policies for follows table
-- Allows users to view, insert, and delete their own follow relationships
-- This fixes 403 errors when trying to follow/unfollow users

-- Policy: Anyone can view follow relationships (for displaying follower counts, etc.)
DROP POLICY IF EXISTS "Anyone can view follows" ON public.follows;
CREATE POLICY "Anyone can view follows" ON public.follows
  FOR SELECT USING (true);

-- Policy: Users can insert their own follow relationships
DROP POLICY IF EXISTS "Users can insert their own follows" ON public.follows;
CREATE POLICY "Users can insert their own follows" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Policy: Users can delete their own follow relationships
DROP POLICY IF EXISTS "Users can delete their own follows" ON public.follows;
CREATE POLICY "Users can delete their own follows" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);
