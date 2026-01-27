-- Fix view_history RLS: Add UPDATE policy for upsert operations
-- The upsert operation requires UPDATE permission to update existing records

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can update own view history" ON view_history;

-- Users can update their own view history (needed for upsert)
CREATE POLICY "Users can update own view history" ON view_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
