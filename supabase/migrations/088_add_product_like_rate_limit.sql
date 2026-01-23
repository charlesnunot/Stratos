-- 添加商品点赞速率限制
-- 防止恶意刷赞行为，限制用户在60秒内最多点赞20次商品

-- 创建商品点赞速率限制函数
CREATE OR REPLACE FUNCTION enforce_product_like_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- 统计该用户在最近60秒内的商品点赞数
  SELECT COUNT(*) INTO recent_count
  FROM product_likes
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  
  -- 如果超过限制（>= 20），抛出异常阻止插入
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded for product likes'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_enforce_product_like_rate_limit ON product_likes;
CREATE TRIGGER trigger_enforce_product_like_rate_limit
  BEFORE INSERT ON product_likes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_product_like_rate_limit();
