-- 阶段3 社区运营：与内容类型相关的徽章（故事/音乐/短视频）
-- 插入后可由服务端/定时任务根据行为授予用户

INSERT INTO public.badges (id, key, name, description, sort_order)
VALUES
  (gen_random_uuid(), 'story_creator', '故事创作者', '发布过故事/小说类内容', 10),
  (gen_random_uuid(), 'music_creator', '音乐创作者', '发布过音乐类内容', 11),
  (gen_random_uuid(), 'short_video_creator', '短视频创作者', '发布过短视频类内容', 12)
ON CONFLICT (key) DO NOTHING;

-- Admin：按 post_type 统计已审核帖子数量
CREATE OR REPLACE FUNCTION public.get_post_counts_by_type()
RETURNS TABLE(post_type TEXT, post_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.post_type, 'normal')::TEXT AS post_type, count(*)::BIGINT AS post_count
  FROM posts p
  WHERE p.status = 'approved'
  GROUP BY p.post_type;
$$;

COMMENT ON FUNCTION public.get_post_counts_by_type() IS 'Returns post count per post_type for approved posts. Used by admin dashboard.';
