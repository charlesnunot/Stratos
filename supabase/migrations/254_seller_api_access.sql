-- Migration: Seller API Access System
-- Description: API key management for Scale tier sellers
-- Tier: Scale ($100) only

-- 1. 创建卖家API密钥表
CREATE TABLE IF NOT EXISTS seller_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 密钥信息
  key_name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL, -- 存储哈希值，不存储明文
  api_key_prefix TEXT NOT NULL, -- 密钥前缀，用于显示
  
  -- 权限配置
  permissions JSONB DEFAULT '["read:products", "read:orders"]'::jsonb,
  -- 可选权限: read:products, write:products, read:orders, write:orders, 
  --           read:analytics, read:inventory, write:inventory
  
  -- 使用限制
  rate_limit_per_minute INTEGER DEFAULT 60,
  daily_quota INTEGER DEFAULT 1000,
  
  -- 使用统计
  last_used_at TIMESTAMPTZ,
  request_count INTEGER DEFAULT 0,
  
  -- 状态
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建API使用日志表
CREATE TABLE IF NOT EXISTS seller_api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID REFERENCES seller_api_keys(id) ON DELETE SET NULL,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 请求信息
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  
  -- 响应信息
  status_code INTEGER,
  response_time_ms INTEGER,
  
  -- 错误信息
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_api_keys_seller ON seller_api_keys(seller_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON seller_api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_logs_key ON seller_api_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_seller ON seller_api_logs(seller_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON seller_api_logs(created_at);

-- 4. 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_api_keys_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_api_keys_timestamp ON seller_api_keys;
CREATE TRIGGER update_api_keys_timestamp
  BEFORE UPDATE ON seller_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_timestamp();

-- 5. 创建函数：验证API密钥
CREATE OR REPLACE FUNCTION verify_api_key(p_api_key TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  seller_id UUID,
  key_id UUID,
  permissions JSONB,
  rate_limit INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_key_prefix TEXT;
  v_key_record RECORD;
  v_daily_count INTEGER;
BEGIN
  -- 提取前缀
  v_key_prefix := SPLIT_PART(p_api_key, '_', 1) || '_' || SPLIT_PART(p_api_key, '_', 2);
  
  -- 查找密钥
  SELECT * INTO v_key_record
  FROM seller_api_keys
  WHERE api_key_prefix = v_key_prefix
    AND is_active = true;
  
  -- 密钥不存在
  IF v_key_record IS NULL THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::UUID, NULL::JSONB, 0::INTEGER, 'Invalid API key'::TEXT;
    RETURN;
  END IF;
  
  -- 检查是否过期
  IF v_key_record.expires_at IS NOT NULL AND v_key_record.expires_at < NOW() THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::UUID, NULL::JSONB, 0::INTEGER, 'API key expired'::TEXT;
    RETURN;
  END IF;
  
  -- 检查每日配额
  SELECT COUNT(*) INTO v_daily_count
  FROM seller_api_logs
  WHERE api_key_id = v_key_record.id
    AND created_at >= CURRENT_DATE;
  
  IF v_daily_count >= v_key_record.daily_quota THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::UUID, NULL::JSONB, 0::INTEGER, 'Daily quota exceeded'::TEXT;
    RETURN;
  END IF;
  
  -- 验证哈希 (简化版，实际应使用 crypt)
  -- 注意：实际生产环境应该使用 pgcrypto 扩展的 crypt 函数
  IF v_key_record.api_key_hash != MD5(p_api_key) THEN
    RETURN QUERY SELECT false::BOOLEAN, NULL::UUID, NULL::UUID, NULL::JSONB, 0::INTEGER, 'Invalid API key'::TEXT;
    RETURN;
  END IF;
  
  -- 更新最后使用时间和计数
  UPDATE seller_api_keys
  SET last_used_at = NOW(),
      request_count = request_count + 1
  WHERE id = v_key_record.id;
  
  RETURN QUERY SELECT 
    true::BOOLEAN, 
    v_key_record.seller_id, 
    v_key_record.id, 
    v_key_record.permissions,
    v_key_record.rate_limit_per_minute,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建函数：记录API调用
CREATE OR REPLACE FUNCTION log_api_call(
  p_api_key_id UUID,
  p_seller_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_ip_address INET,
  p_user_agent TEXT,
  p_status_code INTEGER,
  p_response_time_ms INTEGER,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO seller_api_logs (
    api_key_id,
    seller_id,
    endpoint,
    method,
    ip_address,
    user_agent,
    status_code,
    response_time_ms,
    error_message
  ) VALUES (
    p_api_key_id,
    p_seller_id,
    p_endpoint,
    p_method,
    p_ip_address,
    p_user_agent,
    p_status_code,
    p_response_time_ms,
    p_error_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 创建视图：API使用统计
CREATE OR REPLACE VIEW seller_api_stats AS
SELECT 
  seller_id,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_requests,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_requests,
  AVG(response_time_ms) as avg_response_time,
  COUNT(*) FILTER (WHERE status_code >= 400) as error_count
FROM seller_api_logs
GROUP BY seller_id;

-- 8. 添加RLS策略
ALTER TABLE seller_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_api_logs ENABLE ROW LEVEL SECURITY;

-- 卖家可以管理自己的API密钥
CREATE POLICY "sellers_can_manage_own_api_keys"
  ON seller_api_keys
  FOR ALL
  TO authenticated
  USING (seller_id = auth.uid());

-- 卖家可以查看自己的API日志
CREATE POLICY "sellers_can_view_own_api_logs"
  ON seller_api_logs
  FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

-- 9. 创建函数：检查API访问权限（Scale档位）
CREATE OR REPLACE FUNCTION can_use_api_access(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_seller_type TEXT;
  v_subscription_tier INTEGER;
BEGIN
  -- 检查卖家类型
  SELECT seller_type INTO v_seller_type
  FROM profiles
  WHERE id = p_user_id;
  
  -- 直营卖家可以使用
  IF v_seller_type = 'direct' THEN
    RETURN true;
  END IF;
  
  -- 检查订阅档位
  SELECT subscription_tier INTO v_subscription_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY expires_at DESC
  LIMIT 1;
  
  -- Scale档位(100)可以使用
  RETURN COALESCE(v_subscription_tier, 0) >= 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. 添加注释
COMMENT ON TABLE seller_api_keys IS '卖家API密钥表 - Scale档位功能';
COMMENT ON TABLE seller_api_logs IS 'API调用日志表';
COMMENT ON FUNCTION verify_api_key IS '验证API密钥有效性';
