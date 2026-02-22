-- 评论审核通过时通知帖子作者（及被回复的评论作者）
-- 当前已有：INSERT 且 status = 'approved' 时触发通知；缺少：UPDATE 从 pending -> approved 时触发
-- 设计：仅审核后发送通知，不通知未审核评论，避免垃圾/被拒评论打扰作者

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_create_comment_notification_on_approval') THEN
    CREATE TRIGGER trigger_create_comment_notification_on_approval
      AFTER UPDATE ON comments
      FOR EACH ROW
      WHEN (
        OLD.status IS DISTINCT FROM 'approved'
        AND NEW.status = 'approved'
      )
      EXECUTE FUNCTION create_comment_notification();
  END IF;
END $$;

COMMENT ON TRIGGER trigger_create_comment_notification_on_approval ON comments
IS '评论状态从非 approved 变为 approved 时，通知帖子作者或被回复的评论作者';
