-- 允许评论回复无限层；UI 端最多展示 2 层（超过 2 层按 2 层扁平展示）
DROP TRIGGER IF EXISTS check_comment_depth_trigger ON comments;

COMMENT ON TABLE comments IS '评论支持多级回复；前端展示时最多 2 层，深层回复扁平化为第 2 层显示';
