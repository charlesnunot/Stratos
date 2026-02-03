-- 扩展 post_type 与多模态内容字段（故事/音乐/短视频）
-- 兼容旧值：normal, series, affiliate；新增：text, image, story, music, short_video

-- 1) 扩展 post_type 约束
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_post_type_check CHECK (
  post_type IN (
    'normal', 'series', 'affiliate',
    'text', 'image', 'story', 'music', 'short_video'
  )
);

-- 2) 新增可空列（按类型区分）
-- story
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS chapter_number INT DEFAULT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS content_length INT DEFAULT NULL;

-- music
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS music_url TEXT DEFAULT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT NULL;

-- short_video（与 music 共用 duration_seconds）
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.posts.chapter_number IS 'Story: chapter number';
COMMENT ON COLUMN public.posts.content_length IS 'Story: word count';
COMMENT ON COLUMN public.posts.music_url IS 'Music: audio file URL';
COMMENT ON COLUMN public.posts.duration_seconds IS 'Music/Short video: duration in seconds';
COMMENT ON COLUMN public.posts.video_url IS 'Short video: video file URL';
COMMENT ON COLUMN public.posts.cover_url IS 'Short video/music: cover image URL';
