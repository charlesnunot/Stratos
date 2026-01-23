-- 添加收藏速率限制
-- 防止恶意刷收藏行为，限制用户在60秒内最多收藏20次

-- 创建收藏速率限制函数
CREATE OR REPLACE FUNCTION enforce_favorite_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- 统计该用户在最近60秒内的收藏数（所有类型）
  SELECT COUNT(*) INTO recent_count
  FROM favorites
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  
  -- 如果超过限制（>= 20），抛出异常阻止插入
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded for favorites'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_enforce_favorite_rate_limit ON favorites;
CREATE TRIGGER trigger_enforce_favorite_rate_limit
  BEFORE INSERT ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION enforce_favorite_rate_limit();
