-- Allow post_id to be NULL in tip_transactions to support direct user tipping (without a post)
-- ✅ 支持直接打赏用户功能

-- Drop the NOT NULL constraint on post_id
ALTER TABLE tip_transactions
  ALTER COLUMN post_id DROP NOT NULL;

-- Update the foreign key constraint to allow NULL
-- PostgreSQL automatically handles NULL values in foreign keys
-- No need to change the foreign key constraint

-- Add comment
COMMENT ON COLUMN tip_transactions.post_id IS 'Post ID if tipping a post, NULL if directly tipping a user';
