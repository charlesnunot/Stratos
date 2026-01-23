-- Add missing indexes for social tables (performance)

-- comments
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);

-- likes (PK is (user_id, post_id); index by post_id speeds counts/feeds)
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);

-- follows (PK is (follower_id, followee_id); add reverse lookup)
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee_id ON public.follows(followee_id);

-- comment_likes (PK is (user_id, comment_id); index by comment_id speeds counts)
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes(comment_id);

