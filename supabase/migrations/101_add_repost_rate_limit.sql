-- 添加转发速率限制
-- 防止恶意刷转发行为，限制用户在60秒内最多转发20次
-- 与其他功能（点赞、收藏、"想要"）保持一致的限制策略

-- 创建转发速率限制函数
CREATE OR REPLACE FUNCTION enforce_repost_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- 统计该用户在最近60秒内的转发数（所有类型）
  SELECT COUNT(*) INTO recent_count
  FROM reposts
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  
  -- 如果超过限制（>= 20），抛出异常阻止插入
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded for reposts'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_enforce_repost_rate_limit ON reposts;
CREATE TRIGGER trigger_enforce_repost_rate_limit
  BEFORE INSERT ON reposts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_repost_rate_limit();
