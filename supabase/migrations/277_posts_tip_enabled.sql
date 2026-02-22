-- Add tip_enabled column to posts table for per-post tip control
-- This allows users with tip subscription to control which posts can receive tips

-- Add tip_enabled column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tip_enabled BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN posts.tip_enabled IS 'Per-post tip control. When true and author has active tip subscription, this post can receive tips. Default true for backward compatibility.';

-- Create index for filtering posts by tip_enabled
CREATE INDEX IF NOT EXISTS idx_posts_tip_enabled ON posts(tip_enabled) WHERE tip_enabled = true;

-- Update existing posts to have tip_enabled = true (for backward compatibility)
UPDATE posts SET tip_enabled = true WHERE tip_enabled IS NULL;
