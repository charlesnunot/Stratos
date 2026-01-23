-- 添加举报速率限制
-- 防止恶意刷举报/误触导致管理员通知轰炸
--
-- 策略（结合计划中的两种建议一起实现）：
-- 1) 全局：同一举报者 60 秒内最多 10 次举报
-- 2) 同内容：同一举报者对同一 reported_type+reported_id 24 小时内最多 3 次举报

CREATE OR REPLACE FUNCTION enforce_report_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- 方案1：限制总举报次数（60秒内最多10次）
  SELECT COUNT(*) INTO recent_count
  FROM reports
  WHERE reporter_id = NEW.reporter_id
    AND created_at > NOW() - INTERVAL '60 seconds';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded for reports'
      USING ERRCODE = 'P0001';
  END IF;

  -- 方案2：限制对同一内容的举报次数（24小时内最多3次）
  SELECT COUNT(*) INTO recent_count
  FROM reports
  WHERE reporter_id = NEW.reporter_id
    AND reported_type = NEW.reported_type
    AND reported_id = NEW.reported_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded for reports'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_report_rate_limit ON reports;
CREATE TRIGGER trigger_enforce_report_rate_limit
  BEFORE INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION enforce_report_rate_limit();

