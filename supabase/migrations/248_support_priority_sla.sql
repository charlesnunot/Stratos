-- 客服响应时间SLA配置表
-- 支持订阅卖家的优先客服响应时间控制

-- 1. 添加客服工单响应时间相关字段
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'standard' CHECK (priority_level IN ('standard', 'priority', 'vip')),
ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
ADD COLUMN IF NOT EXISTS is_sla_breached BOOLEAN DEFAULT false;

-- 2. 创建客服响应时间SLA配置表
CREATE TABLE IF NOT EXISTS support_response_sla (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_tier INTEGER NOT NULL UNIQUE, -- 15/50/100
  tier_name TEXT NOT NULL, -- Starter/Growth/Scale
  response_hours INTEGER NOT NULL, -- 标准响应时间（小时）
  priority_level TEXT NOT NULL CHECK (priority_level IN ('standard', 'priority', 'vip')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 插入默认SLA配置
INSERT INTO support_response_sla (subscription_tier, tier_name, response_hours, priority_level)
VALUES 
  (15, 'Starter', 24, 'standard'),   -- Starter: 24小时内响应
  (50, 'Growth', 6, 'priority'),     -- Growth: 6小时内响应
  (100, 'Scale', 2, 'vip')           -- Scale: 2小时内响应
ON CONFLICT (subscription_tier) DO UPDATE SET
  tier_name = EXCLUDED.tier_name,
  response_hours = EXCLUDED.response_hours,
  priority_level = EXCLUDED.priority_level,
  updated_at = NOW();

-- 4. 创建函数：获取用户的客服优先级
CREATE OR REPLACE FUNCTION get_user_support_priority(p_user_id UUID)
RETURNS TABLE (
  priority_level TEXT,
  sla_hours INTEGER,
  tier_name TEXT
) AS $$
DECLARE
  v_subscription_tier INTEGER;
  v_seller_type TEXT;
BEGIN
  -- 获取用户订阅信息
  SELECT 
    p.seller_type,
    s.subscription_tier
  INTO 
    v_seller_type,
    v_subscription_tier
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id 
    AND s.subscription_type = 'seller'
    AND s.status = 'active'
    AND s.expires_at > NOW()
  WHERE p.id = p_user_id;

  -- Direct卖家或Scale档位返回VIP
  IF v_seller_type = 'direct' OR v_subscription_tier = 100 THEN
    RETURN QUERY SELECT 'vip'::TEXT, 2, 'Scale'::TEXT;
  -- Growth档位返回Priority
  ELSIF v_subscription_tier = 50 THEN
    RETURN QUERY SELECT 'priority'::TEXT, 6, 'Growth'::TEXT;
  -- 其他返回Standard
  ELSE
    RETURN QUERY SELECT 'standard'::TEXT, 24, 'Starter'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 创建函数：创建工单时自动设置SLA
CREATE OR REPLACE FUNCTION set_ticket_sla_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_priority RECORD;
BEGIN
  -- 获取用户优先级
  SELECT * INTO v_priority FROM get_user_support_priority(NEW.user_id);
  
  -- 设置工单优先级和SLA
  NEW.priority_level := v_priority.priority_level;
  NEW.sla_hours := v_priority.sla_hours;
  NEW.response_deadline := NOW() + (v_priority.sla_hours || ' hours')::INTERVAL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建触发器
DROP TRIGGER IF EXISTS trigger_set_ticket_sla ON support_tickets;
CREATE TRIGGER trigger_set_ticket_sla
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_ticket_sla_on_insert();

-- 7. 创建函数：检查SLA是否超时
CREATE OR REPLACE FUNCTION check_sla_breach()
RETURNS void AS $$
BEGIN
  UPDATE support_tickets
  SET is_sla_breached = true
  WHERE 
    status IN ('open', 'in_progress')
    AND first_response_at IS NULL
    AND response_deadline < NOW()
    AND is_sla_breached = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 创建函数：记录首次响应时间
CREATE OR REPLACE FUNCTION record_first_response()
RETURNS TRIGGER AS $$
BEGIN
  -- 如果是Support/Admin的首次回复，记录首次响应时间
  IF OLD.first_response_at IS NULL AND NEW.assigned_to IS NOT NULL THEN
    NEW.first_response_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 创建触发器记录首次响应
DROP TRIGGER IF EXISTS trigger_record_first_response ON support_tickets;
CREATE TRIGGER trigger_record_first_response
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION record_first_response();

-- 10. 创建视图：工单SLA统计
CREATE OR REPLACE VIEW support_ticket_sla_stats AS
SELECT 
  priority_level,
  COUNT(*) as total_tickets,
  COUNT(*) FILTER (WHERE is_sla_breached) as breached_tickets,
  COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND NOT is_sla_breached) as responded_on_time,
  ROUND(
    COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND NOT is_sla_breached) * 100.0 / NULLIF(COUNT(*), 0),
    2
  ) as sla_compliance_rate
FROM support_tickets
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY priority_level;

-- 11. 添加索引优化查询
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_level ON support_tickets(priority_level);
CREATE INDEX IF NOT EXISTS idx_support_tickets_response_deadline ON support_tickets(response_deadline);
CREATE INDEX IF NOT EXISTS idx_support_tickets_is_sla_breached ON support_tickets(is_sla_breached) WHERE is_sla_breached = true;

-- 12. 更新现有工单的SLA数据（如果有）
UPDATE support_tickets st
SET 
  priority_level = COALESCE((SELECT priority_level FROM get_user_support_priority(st.user_id)), 'standard'),
  sla_hours = COALESCE((SELECT sla_hours FROM get_user_support_priority(st.user_id)), 24),
  response_deadline = COALESCE(
    st.created_at + ((SELECT sla_hours FROM get_user_support_priority(st.user_id)) || ' hours')::INTERVAL,
    st.created_at + INTERVAL '24 hours'
  )
WHERE priority_level IS NULL;
