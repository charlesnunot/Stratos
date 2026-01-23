-- 添加商品"想要"速率限制
-- 防止恶意刷"想要"行为，限制用户在60秒内最多标记20次商品为"想要"

-- 创建商品"想要"速率限制函数
CREATE OR REPLACE FUNCTION enforce_product_want_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- 统计该用户在最近60秒内的商品"想要"数
  SELECT COUNT(*) INTO recent_count
  FROM product_wants
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  
  -- 如果超过限制（>= 20），抛出异常阻止插入
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded for product wants'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_enforce_product_want_rate_limit ON product_wants;
CREATE TRIGGER trigger_enforce_product_want_rate_limit
  BEFORE INSERT ON product_wants
  FOR EACH ROW
  EXECUTE FUNCTION enforce_product_want_rate_limit();
