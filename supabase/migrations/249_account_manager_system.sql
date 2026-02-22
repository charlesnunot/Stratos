-- 专属客户经理分配系统
-- 仅Scale档位($100)卖家享受专属客户经理服务

-- 1. 创建客户经理表
CREATE TABLE IF NOT EXISTS account_managers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  title TEXT DEFAULT '客户经理', -- 职位头衔
  bio TEXT, -- 简介
  max_clients INTEGER DEFAULT 50, -- 最大客户数
  current_clients INTEGER DEFAULT 0, -- 当前客户数
  is_active BOOLEAN DEFAULT true,
  working_hours TEXT, -- 工作时间，如 "9:00-18:00"
  languages TEXT[], -- 支持语言
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id)
);

-- 2. 创建客户经理-卖家关联表
CREATE TABLE IF NOT EXISTS account_manager_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id), -- 分配人（Admin）
  notes TEXT, -- 备注
  is_active BOOLEAN DEFAULT true,
  last_contact_at TIMESTAMPTZ, -- 最后联系时间
  UNIQUE(seller_id)
);

-- 3. 在profiles表添加客户经理字段（可选，用于快速查询）
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS account_manager_id UUID REFERENCES account_managers(id);

-- 4. 创建客户经理沟通记录表
CREATE TABLE IF NOT EXISTS account_manager_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id UUID REFERENCES account_managers(id),
  seller_id UUID REFERENCES profiles(id),
  communication_type TEXT CHECK (communication_type IN ('email', 'phone', 'meeting', 'message')),
  subject TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- 5. 创建函数：自动分配客户经理给Scale卖家
CREATE OR REPLACE FUNCTION auto_assign_account_manager()
RETURNS TRIGGER AS $$
DECLARE
  v_available_manager UUID;
  v_seller_type TEXT;
  v_subscription_tier INTEGER;
BEGIN
  -- 只处理Scale档位($100)的卖家
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
  WHERE p.id = NEW.seller_id;

  -- 只给Scale档位且是external卖家的分配客户经理
  IF v_subscription_tier = 100 AND v_seller_type = 'external' THEN
    -- 查找当前客户数最少的活跃客户经理
    SELECT id INTO v_available_manager
    FROM account_managers
    WHERE is_active = true
      AND current_clients < max_clients
    ORDER BY current_clients ASC, created_at ASC
    LIMIT 1;

    IF v_available_manager IS NOT NULL THEN
      -- 创建分配记录
      INSERT INTO account_manager_assignments (
        manager_id,
        seller_id,
        assigned_by,
        notes
      ) VALUES (
        v_available_manager,
        NEW.seller_id,
        NEW.assigned_by,
        '系统自动分配'
      );

      -- 更新profiles表
      UPDATE profiles 
      SET account_manager_id = v_available_manager
      WHERE id = NEW.seller_id;

      -- 更新客户经理客户数
      UPDATE account_managers
      SET current_clients = current_clients + 1
      WHERE id = v_available_manager;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 创建触发器：当卖家升级为Scale档位时自动分配
DROP TRIGGER IF EXISTS trigger_auto_assign_manager ON account_manager_assignments;
-- 注意：这个触发器应该在订阅激活时调用，而不是在assignments表上

-- 7. 创建函数：手动分配或更换客户经理
CREATE OR REPLACE FUNCTION assign_account_manager(
  p_seller_id UUID,
  p_manager_id UUID,
  p_assigned_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_old_manager_id UUID;
  v_seller_subscription_tier INTEGER;
BEGIN
  -- 检查卖家是否是Scale档位
  SELECT s.subscription_tier INTO v_seller_subscription_tier
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id 
    AND s.subscription_type = 'seller'
    AND s.status = 'active'
    AND s.expires_at > NOW()
  WHERE p.id = p_seller_id;

  IF v_seller_subscription_tier != 100 THEN
    RAISE EXCEPTION 'Only Scale tier sellers can have account managers';
  END IF;

  -- 获取旧客户经理
  SELECT manager_id INTO v_old_manager_id
  FROM account_manager_assignments
  WHERE seller_id = p_seller_id AND is_active = true;

  -- 如果有旧客户经理，先标记为不活跃
  IF v_old_manager_id IS NOT NULL THEN
    UPDATE account_manager_assignments
    SET is_active = false
    WHERE seller_id = p_seller_id AND is_active = true;

    -- 减少旧客户经理客户数
    UPDATE account_managers
    SET current_clients = GREATEST(current_clients - 1, 0)
    WHERE id = v_old_manager_id;
  END IF;

  -- 创建新分配
  INSERT INTO account_manager_assignments (
    manager_id,
    seller_id,
    assigned_by,
    notes
  ) VALUES (
    p_manager_id,
    p_seller_id,
    p_assigned_by,
    p_notes
  );

  -- 更新profiles
  UPDATE profiles 
  SET account_manager_id = p_manager_id
  WHERE id = p_seller_id;

  -- 增加新客户经理客户数
  UPDATE account_managers
  SET current_clients = current_clients + 1
  WHERE id = p_manager_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 创建函数：移除客户经理
CREATE OR REPLACE FUNCTION remove_account_manager(
  p_seller_id UUID,
  p_removed_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_manager_id UUID;
BEGIN
  -- 获取当前客户经理
  SELECT manager_id INTO v_manager_id
  FROM account_manager_assignments
  WHERE seller_id = p_seller_id AND is_active = true;

  IF v_manager_id IS NULL THEN
    RETURN false;
  END IF;

  -- 标记分配记录为不活跃
  UPDATE account_manager_assignments
  SET 
    is_active = false,
    notes = COALESCE(notes || ' | 移除原因: ' || p_reason, '移除原因: ' || p_reason)
  WHERE seller_id = p_seller_id AND is_active = true;

  -- 更新profiles
  UPDATE profiles 
  SET account_manager_id = NULL
  WHERE id = p_seller_id;

  -- 减少客户经理客户数
  UPDATE account_managers
  SET current_clients = GREATEST(current_clients - 1, 0)
  WHERE id = v_manager_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 创建视图：卖家客户经理信息
CREATE OR REPLACE VIEW seller_account_manager_view AS
SELECT 
  p.id as seller_id,
  p.username as seller_username,
  p.display_name as seller_display_name,
  au.email as seller_email,
  am.id as manager_id,
  am.name as manager_name,
  am.email as manager_email,
  am.phone as manager_phone,
  am.avatar_url as manager_avatar,
  am.title as manager_title,
  am.working_hours,
  am.languages,
  ama.assigned_at,
  ama.last_contact_at,
  ama.notes,
  s.subscription_tier,
  s.expires_at as subscription_expires_at
FROM profiles p
LEFT JOIN auth.users au ON au.id = p.id
LEFT JOIN account_manager_assignments ama ON ama.seller_id = p.id AND ama.is_active = true
LEFT JOIN account_managers am ON am.id = ama.manager_id
LEFT JOIN subscriptions s ON s.user_id = p.id 
  AND s.subscription_type = 'seller'
  AND s.status = 'active'
WHERE p.role = 'seller' AND p.seller_type = 'external';

-- 10. 创建视图：客户经理统计
CREATE OR REPLACE VIEW account_manager_stats AS
SELECT 
  am.id as manager_id,
  am.name,
  am.email,
  am.max_clients,
  am.current_clients,
  am.is_active,
  COUNT(ama.seller_id) FILTER (WHERE ama.is_active = true) as active_clients,
  COUNT(ama.seller_id) as total_clients_ever,
  MAX(ama.assigned_at) as last_assigned_at,
  MAX(ama.last_contact_at) as last_contact_at
FROM account_managers am
LEFT JOIN account_manager_assignments ama ON ama.manager_id = am.id
GROUP BY am.id, am.name, am.email, am.max_clients, am.current_clients, am.is_active;

-- 11. 添加索引
CREATE INDEX IF NOT EXISTS idx_account_managers_admin_id ON account_managers(admin_id);
CREATE INDEX IF NOT EXISTS idx_account_managers_is_active ON account_managers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_account_manager_assignments_seller_id ON account_manager_assignments(seller_id);
CREATE INDEX IF NOT EXISTS idx_account_manager_assignments_manager_id ON account_manager_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_account_manager_assignments_is_active ON account_manager_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_account_manager_id ON profiles(account_manager_id);

-- 12. 添加RLS策略
-- account_managers表
ALTER TABLE account_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_managers_admin_select ON account_managers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
  ));

CREATE POLICY account_managers_admin_all ON account_managers
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- account_manager_assignments表
ALTER TABLE account_manager_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_manager_assignments_admin_select ON account_manager_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
  ));

CREATE POLICY account_manager_assignments_seller_select ON account_manager_assignments
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY account_manager_assignments_admin_all ON account_manager_assignments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- account_manager_communications表
ALTER TABLE account_manager_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_manager_communications_participants ON account_manager_communications
  FOR SELECT TO authenticated
  USING (
    manager_id IN (SELECT id FROM account_managers WHERE admin_id = auth.uid())
    OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY account_manager_communications_insert ON account_manager_communications
  FOR INSERT TO authenticated
  WITH CHECK (
    manager_id IN (SELECT id FROM account_managers WHERE admin_id = auth.uid())
    OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
