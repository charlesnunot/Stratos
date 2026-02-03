-- 添加关注速率限制
-- 防止恶意刷关注/取关行为，限制用户在60秒内最多关注20次
-- 与点赞、转发、收藏等保持一致的策略

CREATE OR REPLACE FUNCTION enforce_follow_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- 统计该用户在最近60秒内的关注数（INSERT）
  SELECT COUNT(*) INTO recent_count
  FROM follows
  WHERE follower_id = NEW.follower_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded for follows'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_follow_rate_limit ON follows;
CREATE TRIGGER trigger_enforce_follow_rate_limit
  BEFORE INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION enforce_follow_rate_limit();
