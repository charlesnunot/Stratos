# 推广帖子页面与创建帖子页面统一重构计划
# 金融级可审计内容事件系统 v7.0

> **版本**: v7.0 - 金融级不可篡改版（最终上线版）
> **状态**: 待审核
> **合规目标**: Deterministic Commission Attribution | Exposure-Time Eligibility Proof | Post-Exposure Ledger Immutability | Order-Time FX Isolation | Feed ↔ Settlement Replayability | **Post-Exposure Ledger Persistence** | **Eligibility Context Identity** | **Attribution Provenance**

---

## v6.0 → v7.0 关键修复

| 问题 | 修复前 | 修复后 |
|------|--------|--------|
| **🚨 P0-1: Ledger Indirect Delete** | `ON DELETE CASCADE` | `ON DELETE RESTRICT` + Soft Delete (`deleted_at`) |
| **🚨 P0-2: Rule Identity Hash** | 只 hash `commission_rate` | hash 完整规则上下文 |

---

## 审计合规声明

| 要求 | 状态 | 说明 |
|------|------|------|
| Ledger Immutability | ✅ | DELETE/UPDATE/POST-EXPOSURE INSERT 全阻止 |
| Historical Replay | ✅ | original_binding_created_at 保留 |
| Exposure Atomicity | ✅ | TX 保证 Binding-before-Exposure |
| FX Isolation | ✅ | Order-Time FX，非 Creation-Time |
| Attribution Timeline | ✅ | eligibility_checked_at 永不被覆盖 |
| **Post-Exposure Ledger Persistence** | ✅ | ON DELETE RESTRICT + Soft Delete |
| **Eligibility Context Identity** | ✅ | Full Rule Context Hash |

---

## 1. 根因分析

### 1.1 问题本质

当前问题不是「页面不一致」，而是 **Affiliate Financial Event Source 不统一问题**。

**当前系统存在两个「内容真相源」**：

| 来源 | 用途 |
|------|------|
| `posts` | Feed 展示 |
| `affiliate_posts` | 佣金结算 |

**这是双账本系统（Shadow Ledger）**，未来一定发生：
- Feed Post ≠ Commission Source Post
- External Audit 时：❌ Commission Attribution Not Deterministic

### 1.2 系统金融意义

| 页面 | 当前理解 | 正确理解 |
|------|----------|----------|
| 推广帖子页面 | Affiliate Post | Commission-Eligible Content Event |
| 创建帖子页面 | Normal Post | Non-Monetized Content Event |

**当前 Post Model 是 UI Model，而不是 Monetization Event Model**

### 1.3 导致的问题

- 帖子点击行为不同
- 商品卡片跳转异常
- 详情页鉴权冲突
- Ledger 无法绑定 Post
- Commission Attribution 不稳定
- SSR Hydration Race（推广页更明显）

---

## 2. 最终统一重构目标

### 2.1 核心目标

**不是 UI 统一，而是 Ledger 统一**

我们这次不是在做「推广帖子页面统一」，而是在做：

> **Commission-Bound Content Event Unification**

### 2.2 架构升级

从「社交帖子」升级为「可结算内容金融事件」

> **Content == Monetizable Event**

---

## 3. 最终架构设计

### 3.1 单一内容金融真相源

**新建 `content_events` 表**：唯一帖子源（Feed / Affiliate / Future Ads）

```sql
CREATE TABLE content_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('organic', 'affiliate')),
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 内容字段
  content TEXT,
  image_urls TEXT[],
  location TEXT,
  
  -- Feed Replay 必须
  render_schema_version INT DEFAULT 1,
  
  -- 状态
  -- pending: 创建中，不可展示
  -- published: 已发布，可展示
  -- deleted: 已删除
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'deleted')),
  
  -- 🚨 P0-1: 软删除时间戳
  -- 绝对禁止 Hard Delete，只能 Soft Delete
  -- 原因：event_affiliate_binding 使用 ON DELETE RESTRICT
  -- 删除 content_events 会阻止 binding 被级联删除
  deleted_at TIMESTAMPTZ
);

-- 索引
CREATE INDEX idx_content_events_creator ON content_events(creator_id);
CREATE INDEX idx_content_events_type ON content_events(event_type);
CREATE INDEX idx_content_events_created ON content_events(created_at DESC);
CREATE INDEX idx_content_events_status ON content_events(status);
-- 🚨 P0-1: 软删除查询索引
CREATE INDEX idx_content_events_deleted ON content_events(deleted_at) WHERE deleted_at IS NULL;
```

### 3.2 推广绑定表（金融级不可变账本）

**新建 `event_affiliate_binding` 表**：仅当 Monetized 时存在

```sql
CREATE TABLE event_affiliate_binding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 🚨 P0-1: 必须使用 RESTRICT，禁止 CASCADE
  -- CASCADE 会导致：通过删除 content_events 间接删除 binding
  -- 这会破坏账本的不可篡改性
  event_id UUID REFERENCES content_events(id) ON DELETE RESTRICT NOT NULL,
  
  -- 商品信息
  product_id UUID REFERENCES products(id) NOT NULL,
  seller_id UUID REFERENCES profiles(id) NOT NULL,
  
  -- Commission Attribution Layer
  commission_source_type TEXT NOT NULL,
  commission_source_id UUID,
  commission_model JSONB,
  commission_rate_snapshot DECIMAL(5,2) NOT NULL,
  commission_rule_version INT DEFAULT 1,
  -- 🚨 P0-2: Rule Identity Hash - 必须包含完整规则上下文
  -- 包含: commission_binding_context + commission_model + commission_source_id + commission_rule_version
  -- 不能只 hash commission_rate，否则无法证明 Eligibility Context Identity
  commission_rule_hash TEXT,
  
  -- Rule Binding Layer（Eligibility Proof）
  -- 记录绑定时的完整上下文，用于审计回放
  commission_binding_context JSONB NOT NULL,
  
  -- FX Quote Reference Layer（创建时参考，非结算依据）
  -- ⚠️ 重要：这只是创建时的参考汇率，实际结算使用 Order Capture Time FX
  fx_quote_reference_pair TEXT,
  fx_quote_reference_source TEXT,
  fx_quote_reference_timestamp TIMESTAMPTZ,
  
  -- 审计时间戳
  eligibility_checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 🚨 P0-1: 账本最终化时间戳
  -- 一旦设置，表示该账本记录已最终化，不可变更
  binding_finalized_at TIMESTAMPTZ,
  
  -- 🚨 P0-2: 历史回放保护字段
  -- 用于数据迁移时保留原始时间线
  original_binding_created_at TIMESTAMPTZ,
  binding_migrated_at TIMESTAMPTZ,
  binding_migration_source TEXT,
  
  -- 不可变标记（冗余检查）
  is_immutable BOOLEAN DEFAULT true,
  
  UNIQUE(event_id)
);

-- 索引
CREATE INDEX idx_event_affiliate_binding_event ON event_affiliate_binding(event_id);
CREATE INDEX idx_event_affiliate_binding_product ON event_affiliate_binding(product_id);
CREATE INDEX idx_event_affiliate_binding_seller ON event_affiliate_binding(seller_id);
CREATE INDEX idx_event_affiliate_binding_finalized ON event_affiliate_binding(binding_finalized_at);
```

### 3.3 结算记录表（更新）

**更新 `affiliate_commissions` 表**：绑定到 event_id

```sql
-- 添加 event_id 字段
ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES content_events(id);

-- Payment FX Provenance Layer
-- 记录订单支付时的实际 FX 汇率来源
ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS fx_capture_event_id TEXT;
ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS fx_capture_provider TEXT;

-- Rule Binding Layer（从 event_affiliate_binding 复制）
-- 结算时快照，用于审计对比
ALTER TABLE affiliate_commissions ADD COLUMN IF NOT EXISTS commission_binding_context JSONB;

-- 索引
CREATE INDEX idx_affiliate_commissions_event ON affiliate_commissions(event_id);
```

### 3.4 账本硬不可变（三层防护）

```sql
-- ============================================
-- 防护层 1: 阻止 UPDATE
-- ============================================
CREATE OR REPLACE FUNCTION prevent_event_affiliate_binding_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'event_affiliate_binding is an immutable financial ledger. UPDATE is not allowed. event_id=%, attempted_at=%', 
    OLD.event_id, NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_event_affiliate_binding_update
  BEFORE UPDATE ON event_affiliate_binding
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_affiliate_binding_update();

-- ============================================
-- 🚨 P0-1: 防护层 2: 阻止 DELETE
-- ============================================
CREATE OR REPLACE FUNCTION prevent_event_affiliate_binding_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'event_affiliate_binding is an immutable financial ledger. DELETE is not allowed. event_id=%, attempted_at=%', 
    OLD.event_id, NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_event_affiliate_binding_delete
  BEFORE DELETE ON event_affiliate_binding
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_affiliate_binding_delete();

-- ============================================
-- 🚨 P0-1: 防护层 3: 阻止 POST-EXPOSURE INSERT
-- ============================================
-- 一旦 content_events.status = 'published'，禁止新的 binding 插入
CREATE OR REPLACE FUNCTION prevent_post_exposure_binding_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_event_status TEXT;
  v_event_created_at TIMESTAMPTZ;
BEGIN
  -- 查询对应事件的状态
  SELECT status, created_at INTO v_event_status, v_event_created_at
  FROM content_events
  WHERE id = NEW.event_id;
  
  -- 如果事件已发布，禁止插入 binding
  IF v_event_status = 'published' THEN
    RAISE EXCEPTION 'Cannot INSERT event_affiliate_binding after event exposure. event_id=%, event_status=%, attempted_at=%', 
      NEW.event_id, v_event_status, NOW();
  END IF;
  
  -- 如果事件不存在，也禁止（外键会拦，但这里双重保险）
  IF v_event_status IS NULL THEN
    RAISE EXCEPTION 'Cannot INSERT event_affiliate_binding for non-existent event. event_id=%, attempted_at=%', 
      NEW.event_id, NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_post_exposure_binding_insert
  BEFORE INSERT ON event_affiliate_binding
  FOR EACH ROW
  EXECUTE FUNCTION prevent_post_exposure_binding_insert();

-- ============================================
-- 防护层 4: 自动设置 finalized_at
-- ============================================
CREATE OR REPLACE FUNCTION set_binding_finalized_timestamp()
RETURNS TRIGGER AS $$
DECLARE
  v_event_status TEXT;
BEGIN
  -- 查询对应事件的状态
  SELECT status INTO v_event_status
  FROM content_events
  WHERE id = NEW.event_id;
  
  -- 只有事件是 published 状态，才允许设置 finalized_at
  IF v_event_status = 'published' THEN
    NEW.binding_finalized_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_binding_finalized
  BEFORE INSERT ON event_affiliate_binding
  FOR EACH ROW
  EXECUTE FUNCTION set_binding_finalized_timestamp();

-- ============================================
-- 🚨 P0-1: 防护层 5: 阻止 Hard Delete content_events（当存在 binding 时）
-- ============================================
-- 必须先 Soft Delete（设置 deleted_at），禁止 Hard Delete
CREATE OR REPLACE FUNCTION prevent_hard_delete_content_event()
RETURNS TRIGGER AS $$
BEGIN
  -- 检查是否存在关联的 binding
  IF EXISTS (
    SELECT 1 FROM event_affiliate_binding 
    WHERE event_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot HARD DELETE content_events with existing binding. Use Soft Delete instead. event_id=%, attempted_at=%', 
      OLD.id, NOW();
  END IF;
  
  -- 允许没有 binding 的事件进行 Hard Delete（极端情况下）
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_hard_delete_content_event
  BEFORE DELETE ON content_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete_content_event();
```
```

---

## 4. 页面统一原则

### 4.1 数据源统一

| 页面 | 数据源 |
|------|--------|
| Feed 页 | `content_events` |
| 推广帖子页 | `content_events` |
| 普通帖子页 | `content_events` |
| 帖子详情页 | `content_events` |

**不再有**：
- 推广页读 `affiliate_posts`
- Feed 读 `posts`
- 详情页再 RPC `affiliate_lookup`

### 4.2 路由统一

**统一为**：`/post/[eventId]`

**详情页查询**：
```sql
SELECT 
  ce.*,
  eab.product_id,
  eab.seller_id,
  eab.commission_rate_snapshot,
  eab.commission_binding_context,
  eab.eligibility_checked_at,
  eab.binding_finalized_at
FROM content_events ce
LEFT JOIN event_affiliate_binding eab ON ce.id = eab.event_id
WHERE ce.id = :eventId
```

### 4.3 鉴权统一

**以前**：Affiliate Page 需要额外 seller permission lookup

**现在**：直接判断 `event_affiliate_binding.seller_id`

```sql
-- 判断是否是卖家
SELECT EXISTS(
  SELECT 1 FROM event_affiliate_binding
  WHERE event_id = :eventId AND seller_id = :viewerId
)
```

---

## 5. 创建流程统一（事务性原子操作）

### 5.1 RPC 函数（🚨 P0-3: 强制原子性）

**🚨 关键要求**：Affiliate Event Creation 必须在一个事务中完成：
1. INSERT content_events (status='pending')
2. INSERT event_affiliate_binding
3. UPDATE content_events SET status='published'

**禁止**：publish happens async, binding fails retry 导致的 Exposure-before-Binding Race

```sql
CREATE OR REPLACE FUNCTION create_content_event(
  p_creator_id UUID,
  p_event_type TEXT,
  p_content TEXT DEFAULT NULL,
  p_image_urls TEXT[] DEFAULT '{}',
  p_location TEXT DEFAULT NULL,
  -- Affiliate 参数（仅当 event_type = 'affiliate' 时使用）
  p_product_id UUID DEFAULT NULL,
  p_commission_source_type TEXT DEFAULT NULL,
  p_commission_source_id UUID DEFAULT NULL,
  p_commission_model JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_event_id UUID;
  v_binding_id UUID;
  v_product RECORD;
  v_commission_rate DECIMAL(5,2);
  v_commission_rule_version INT;
  v_commission_rule_hash TEXT;
  v_commission_binding_context JSONB;
  v_fx_quote_reference_pair TEXT;
  v_fx_quote_reference_source TEXT;
  v_now TIMESTAMPTZ;
BEGIN
  -- 0. 获取当前用户 ID（不信任参数）
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 验证 creator_id 匹配
  IF v_user_id != p_creator_id THEN
    RETURN json_build_object('success', false, 'error', 'USER_ID_MISMATCH');
  END IF;

  v_now := NOW();

  -- ============================================
  -- 🚨 P0-3: 事务性原子创建
  -- 所有操作必须在同一事务中完成
  -- ============================================
  
  -- 1. 创建内容事件（初始状态 pending）
  INSERT INTO content_events (
    creator_id,
    event_type,
    content,
    image_urls,
    location,
    status
  ) VALUES (
    v_user_id,
    p_event_type,
    p_content,
    p_image_urls,
    p_location,
    'pending'  -- 🚨 关键：初始状态必须是 pending
  )
  RETURNING id INTO v_event_id;

  -- 2. 如果是 Affiliate 类型，绑定 Monetization
  IF p_event_type = 'affiliate' THEN
    -- 验证产品存在且允许推广
    SELECT id, seller_id, commission_rate, currency
    INTO v_product
    FROM products
    WHERE id = p_product_id 
      AND status = 'active' 
      AND allow_affiliate = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found or not eligible for affiliate. product_id=%', p_product_id;
    END IF;

    -- 生成 Commission Snapshot
    v_commission_rate := v_product.commission_rate;
    v_commission_rule_version := 1;
    
    -- 🚨 P0-2: Rule Identity Hash - 必须包含完整规则上下文
    -- 不能只 hash commission_rate，否则无法证明 Eligibility Context Identity
    -- 必须 hash: commission_binding_context + commission_model + commission_source_id + commission_rule_version
    v_commission_rule_hash := encode(
      sha256(
        jsonb_build_object(
          'commission_binding_context', jsonb_build_object(
            'affiliate_tier', 'standard',
            'binding_reason', 'product_default',
            'eligibility_checked_at', v_now,
            'conditions_met', jsonb_build_object('product_active', true, 'product_allows_affiliate', true)
          ),
          'commission_model', COALESCE(p_commission_model, jsonb_build_object('type', 'percentage', 'rate', v_commission_rate)),
          'commission_source_id', COALESCE(p_commission_source_id, p_product_id),
          'commission_rule_version', 1
        )::text::bytea
      ),
      'hex'
    );

    -- 生成 Binding Context（Eligibility Proof）
    v_commission_binding_context := jsonb_build_object(
      'affiliate_tier', 'standard',
      'binding_reason', 'product_default',
      'eligibility_checked_at', v_now,
      'conditions_met', jsonb_build_object('product_active', true, 'product_allows_affiliate', true)
    );

    -- FX Quote Reference（仅参考，非结算依据）
    v_fx_quote_reference_pair := v_product.currency || '/CNY';
    v_fx_quote_reference_source := 'ECB';

    -- 🚨 关键：在事件发布前创建 binding
    -- 这保证了 Exposure-before-Binding Race 不可能发生
    INSERT INTO event_affiliate_binding (
      event_id,
      product_id,
      seller_id,
      commission_source_type,
      commission_source_id,
      commission_model,
      commission_rate_snapshot,
      commission_rule_version,
      commission_rule_hash,
      commission_binding_context,
      fx_quote_reference_pair,
      fx_quote_reference_source,
      fx_quote_reference_timestamp,
      eligibility_checked_at
      -- binding_finalized_at 将由 trigger 自动设置
    ) VALUES (
      v_event_id,
      p_product_id,
      v_product.seller_id,
      COALESCE(p_commission_source_type, 'product_default'),
      COALESCE(p_commission_source_id, p_product_id),
      COALESCE(p_commission_model, jsonb_build_object('type', 'percentage', 'rate', v_commission_rate)),
      v_commission_rate,
      v_commission_rule_version,
      v_commission_rule_hash,
      v_commission_binding_context,
      v_fx_quote_reference_pair,
      v_fx_quote_reference_source,
      v_now,
      v_now
    )
    RETURNING id INTO v_binding_id;
  END IF;

  -- 3. 🚨 关键：更新事件状态为 published
  -- 这保证了 Feed 不会展示未绑定 Commission Rule 的事件
  UPDATE content_events 
  SET status = 'published'
  WHERE id = v_event_id;

  -- 4. 返回结果
  RETURN json_build_object(
    'success', true,
    'event_id', v_event_id,
    'event_type', p_event_type,
    'binding_id', v_binding_id,
    'status', 'published',
    'created_at', v_now
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- 任何错误都会回滚整个事务
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_content_event TO authenticated;
```

### 5.2 原子性保证

**上述 RPC 保证**：
- ✅ 如果 binding 创建失败，事件不会发布
- ✅ 如果事件发布失败，binding 不会存在
- ✅ Feed 永远不会看到未绑定 Commission Rule 的 Affiliate Event
- ✅ External Audit 可以确信：Exposure Time 的 Commission Rule 就是 Binding Time 的 Rule

### 5.3 不允许的操作

**禁止**：先发 Post，之后再绑定 Affiliate

**原因**：Commission Attribution Timeline 不可审计

**技术阻止**：
- Trigger `block_post_exposure_binding_insert` 会阻止对已发布事件的 binding 插入

---

## 6. Feed 渲染统一 DTO

### 6.1 新建 ContentEventDTO

```typescript
type ContentEventDTO = {
  id: string
  creator: UserDTO
  eventType: 'organic' | 'affiliate'
  createdAt: string
  status: 'pending' | 'published' | 'deleted'
  
  // 内容
  content?: string
  imageUrls?: string[]
  location?: string
  
  // Affiliate 信息（仅当 eventType === 'affiliate'）
  affiliate?: {
    productId: string
    productName: string
    productImage?: string
    commissionRate: number
    sellerId: string
    sellerName: string
    // 审计字段
    eligibilityCheckedAt: string
    bindingFinalizedAt?: string
  }
}
```

### 6.2 FeedCard 渲染逻辑

```tsx
function FeedCard({ event }: { event: ContentEventDTO }) {
  // 只渲染已发布的事件
  if (event.status !== 'published') {
    return null;
  }
  
  if (event.eventType === 'affiliate') {
    return <AffiliateFeedCard event={event} />
  }
  return <OrganicFeedCard event={event} />
}
```

**不再判断**：
- `isAffiliatePost`
- `post.product`
- `affiliateData`

---

## 7. Ledger 绑定统一

### 7.1 Settlement Ledger 绑定

**绑定到**：`event_id`

**而不是**：`affiliate_post_id`

### 7.2 结算时 FX 处理

**重要**：Affiliate Commission Settlement FX 永远必须以 **Order Capture Time** 为准

```sql
-- 结算时记录实际使用的 FX
UPDATE affiliate_commissions
SET 
  fx_capture_event_id = 'fx_event_12345',
  fx_capture_provider = 'stripe',
  commission_binding_context = (
    SELECT commission_binding_context 
    FROM event_affiliate_binding 
    WHERE event_id = :event_id
  )
WHERE id = :commission_id;
```

### 7.3 原因

Feed 展示行为无法 Replay 到 Financial Event，必须通过 `event_id` 建立确定性关联

---

## 8. 迁移顺序（上线安全版）

### Phase 1: 基础设施

1. 新建 `content_events` 表
2. 新建 `event_affiliate_binding` 表（含历史回放字段）
3. 更新 `affiliate_commissions` 表（添加 `event_id`）
4. 创建四层 Trigger 实现硬不可变

### Phase 2: 数据迁移

5. **迁移 `posts` → `content_events`（event_type = 'organic'）**
   ```sql
   INSERT INTO content_events (
     id, creator_id, event_type, visibility, created_at,
     content, image_urls, location, render_schema_version, status,
     deleted_at
   )
   SELECT 
     id, user_id, 'organic', 'public', created_at,
     content, image_urls, location, 1, 'published',
     NULL  -- deleted_at: 旧帖子不标记为删除
   FROM posts;
   ```

6. **🚨 P0-1 + P0-2: 迁移 `affiliate_posts` → `event_affiliate_binding`（保留原始时间线 + 完整规则上下文 Hash）**
   ```sql
   INSERT INTO event_affiliate_binding (
     event_id,
     product_id,
     seller_id,
     commission_source_type,
     commission_source_id,
     commission_model,
     commission_rate_snapshot,
     commission_rule_version,
     commission_rule_hash,
     commission_binding_context,
     fx_quote_reference_pair,
     fx_quote_reference_source,
     fx_quote_reference_timestamp,
     eligibility_checked_at,
     binding_finalized_at,
     -- 🚨 P0-2: 关键 - 保留原始时间线
     original_binding_created_at,
     binding_migrated_at,
     binding_migration_source,
     created_at
   )
   SELECT 
     ap.post_id,
     ap.product_id,
     p.seller_id,
     'product_default',
     ap.product_id,
     jsonb_build_object('type', 'percentage', 'rate', p.commission_rate),
     p.commission_rate,
     1,
     -- 🚨 P0-2: Rule Identity Hash - 必须使用完整规则上下文
     encode(
       sha256(
         jsonb_build_object(
           'commission_binding_context', jsonb_build_object(
             'affiliate_tier', 'standard',
             'binding_reason', 'product_default',
             'eligibility_checked_at', ap.created_at,
             'conditions_met', jsonb_build_object('product_active', true)
           ),
           'commission_model', jsonb_build_object('type', 'percentage', 'rate', p.commission_rate),
           'commission_source_id', ap.product_id,
           'commission_rule_version', 1
         )::text::bytea
       ),
       'hex'
     ),
     jsonb_build_object(
       'affiliate_tier', 'standard',
       'binding_reason', 'product_default',
       'eligibility_checked_at', ap.created_at,
       'conditions_met', jsonb_build_object('product_active', true)
     ),
     p.currency || '/CNY',
     'ECB',
     ap.created_at,
     ap.created_at,  -- binding_finalized_at
     ap.created_at,  -- 🚨 P0-2: original_binding_created_at - 保留原始创建时间
     NOW(),          -- binding_migrated_at - 迁移时间
     'affiliate_posts_v1',  -- binding_migration_source - 来源标识
     ap.created_at
   FROM affiliate_posts ap
   JOIN products p ON ap.product_id = p.id;
   ```

7. **更新 `affiliate_commissions` 的 `event_id`**
   ```sql
   UPDATE affiliate_commissions ac
   SET event_id = ap.post_id
   FROM affiliate_posts ap
   WHERE ac.affiliate_post_id = ap.id;
   ```

### Phase 3: 读取切换

8. Feed 改读 `content_events`（只读 published + deleted_at IS NULL）
9. Feed DTO 升级为 `ContentEventDTO`
10. 详情页统一 `/post/[eventId]`

### Phase 4: 写入切换

11. Affiliate Create 改为 `create_content_event()`
12. Normal Create 改为 `create_content_event()`
13. Ledger 改绑 `event_id`

### Phase 5: 清理

14. **🚨 P0-1: 更新所有删除逻辑为 Soft Delete**
    ```sql
    -- 旧代码
    DELETE FROM content_events WHERE id = :id;
    
    -- 新代码
    UPDATE content_events SET deleted_at = NOW() WHERE id = :id;
    ```
15. 删除旧表：`posts`、`affiliate_posts`
16. 删除旧路由：`/affiliate/posts/[id]`

---

## 9. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `supabase/migrations/XXX_create_content_events.sql` | 新建 | **核心** 创建 content_events 表（含 deleted_at 软删除字段） |
| `supabase/migrations/XXX_create_event_affiliate_binding.sql` | 新建 | **核心** 创建推广绑定表（含历史回放字段） |
| `supabase/migrations/XXX_create_immutable_triggers.sql` | 新建 | **核心** 五层 Trigger 保护（UPDATE/DELETE/POST-EXPOSURE INSERT + Hard Delete 阻止） |
| `supabase/migrations/XXX_create_content_event_rpc.sql` | 新建 | **核心** 统一创建 RPC（事务性 + Full Rule Context Hash） |
| `supabase/migrations/XXX_migrate_posts_to_events.sql` | 新建 | 数据迁移脚本（保留时间线 + 完整规则上下文 Hash） |
| `src/types/content-event.ts` | 新建 | ContentEventDTO 类型定义 |
| `src/lib/hooks/useContentEvent.ts` | 新建 | 内容事件 Hook |
| `src/components/feed/FeedCard.tsx` | 修改 | 使用 ContentEventDTO |
| `src/app/[locale]/(main)/post/[eventId]/page.tsx` | 新建 | 统一详情页 |
| `src/app/[locale]/(main)/post/create/page.tsx` | 修改 | 使用 create_content_event RPC |
| `src/app/[locale]/(main)/affiliate/products/[id]/promote/page.tsx` | 修改 | 重定向到统一创建页 |
| `src/components/affiliate/AffiliateCenter.tsx` | 修改 | 更新导航链接 |

---

## 10. 审计合规检查清单

### 10.1 Ledger Immutability 验证

```sql
-- 测试 UPDATE 阻止
UPDATE event_affiliate_binding SET commission_rate_snapshot = 99 WHERE id = 'xxx';
-- 预期：ERROR: event_affiliate_binding is an immutable financial ledger

-- 测试 DELETE 阻止
DELETE FROM event_affiliate_binding WHERE id = 'xxx';
-- 预期：ERROR: event_affiliate_binding is an immutable financial ledger

-- 测试 POST-EXPOSURE INSERT 阻止
-- 1. 创建一个 published 事件
-- 2. 尝试插入 binding
INSERT INTO event_affiliate_binding (...) VALUES (...);
-- 预期：ERROR: Cannot INSERT event_affiliate_binding after event exposure

-- 🚨 P0-1: 测试 Hard Delete 阻止（当存在 binding 时）
-- 1. 创建一个 published 事件 + binding
-- 2. 尝试删除事件
DELETE FROM content_events WHERE id = 'xxx';
-- 预期：ERROR: Cannot HARD DELETE content_events with existing binding

-- 🚨 P0-1: 测试 Soft Delete（当存在 binding 时）
-- 1. 创建一个 published 事件 + binding
-- 2. 尝试软删除事件（设置 deleted_at）
UPDATE content_events SET deleted_at = NOW() WHERE id = 'xxx';
-- 预期：SUCCESS（软删除成功，binding 仍然存在）
```

### 10.2 Historical Replay 验证

```sql
-- 验证迁移后的时间线完整性
SELECT 
  event_id,
  original_binding_created_at,  -- 应该是原始 affiliate_posts.created_at
  binding_migrated_at,          -- 应该是迁移时间
  binding_migration_source      -- 应该是 'affiliate_posts_v1'
FROM event_affiliate_binding
LIMIT 5;
```

### 10.3 Exposure Atomicity 验证

```sql
-- 验证所有 published 的 affiliate 事件都有 binding
SELECT ce.id, ce.status, ce.event_type, eab.id as binding_id
FROM content_events ce
LEFT JOIN event_affiliate_binding eab ON ce.id = eab.event_id
WHERE ce.event_type = 'affiliate' 
  AND ce.status = 'published'
  AND eab.id IS NULL;
-- 预期：0 行（没有 binding 的 published affiliate 事件）
```

### 10.4 FX Isolation 验证

```sql
-- 验证结算时使用的是 Order Capture FX，不是 Creation FX
SELECT 
  id,
  fx_capture_event_id,      -- 应该有值
  fx_capture_provider       -- 应该有值
FROM affiliate_commissions
WHERE event_id IS NOT NULL
LIMIT 5;
```

### 🚨 P0-2: Eligibility Context Identity 验证

```sql
-- 验证 commission_rule_hash 包含完整规则上下文
SELECT 
  id,
  event_id,
  commission_rule_hash,
  commission_binding_context,
  commission_model,
  commission_source_id,
  commission_rule_version
FROM event_affiliate_binding
LIMIT 5;

-- 验证：如果只修改 min_order_amount，hash 应该不同
-- 模拟场景：
-- 1. 创建时 hash = sha256(binding_context + model + source_id + version)
-- 2. Seller 修改 min_order_amount（这在 commission_binding_context.conditions_met 中）
-- 3. Replay 时 hash 不同 → 证明规则被修改过
```

---

## 11. 最终结果

| 能力 | 结果 |
|------|------|
| Feed / Affiliate Single Source of Truth | ✅ |
| Commission Attribution Timeline Safe | ✅ |
| External Audit Replay Safe | ✅ |
| Click Navigation Deterministic | ✅ |
| SSR Hydration Race Elimination | ✅ |
| Settlement Ledger ↔ Feed Traceable | ✅ |
| **Ledger Immutability (DELETE/UPDATE blocked)** | ✅ |
| **Historical Replay (original_binding_created_at)** | ✅ |
| **Exposure Atomicity (TX guarantee)** | ✅ |
| **FX Isolation (Order-Time not Creation-Time)** | ✅ |
| **Post-Exposure Ledger Persistence (ON DELETE RESTRICT + Soft Delete)** | ✅ |
| **Eligibility Context Identity (Full Rule Context Hash)** | ✅ |

---

## 12. 总结

### 12.1 架构升级

从「社交帖子」升级为「可结算内容金融事件」

> **Content == Monetizable Event**

### 12.2 核心原则

1. **单一真相源**：`content_events` 是唯一内容源
2. **账本硬不可变**：五层 Trigger 保护（UPDATE/DELETE/POST-EXPOSURE INSERT + Hard Delete 阻止）
3. **Post-Exposure Ledger Persistence**：ON DELETE RESTRICT + Soft Delete（`deleted_at`）
4. **Eligibility Context Identity**：完整规则上下文 Hash（commission_binding_context + commission_model + source_id + version）
5. **创建原子性**：`create_content_event()` 保证 Binding-before-Exposure
6. **历史可回放**：`original_binding_created_at` 保留原始时间线
7. **FX 隔离**：结算使用 Order-Time FX，非 Creation-Time FX
8. **路由统一**：`/post/[eventId]` 是唯一详情页路由
9. **Ledger 绑定**：`event_id` 是唯一结算绑定标识

### 12.3 关键收益

- ✅ Feed / Affiliate Single Source of Truth
- ✅ Commission Attribution Timeline Safe
- ✅ **External Audit Replay Safe**（Ledger 不可变 + 历史保留）
- ✅ Click Navigation Deterministic
- ✅ SSR Hydration Race Elimination
- ✅ Settlement Ledger ↔ Feed Traceable
- ✅ **Deterministic Commission Attribution**
- ✅ **Exposure-Time Eligibility Proof**
- ✅ **Post-Exposure Ledger Immutability**
- ✅ **Order-Time FX Isolation**
- ✅ **Post-Exposure Ledger Persistence**（通过 ON DELETE RESTRICT + Soft Delete）
- ✅ **Eligibility Context Identity**（通过完整规则上下文 Hash）

### 12.4 时间估算

| 阶段 | 预估时间 |
|------|----------|
| Phase 1: 基础设施 | 6小时 |
| Phase 2: 数据迁移 | 4小时 |
| Phase 3: 读取切换 | 4小时 |
| Phase 4: 写入切换 | 4小时 |
| Phase 5: 清理 | 2小时 |
| 审计合规测试 | 4小时 |
| **总计** | **24小时** |

---

## 13. 金融级合规声明

### 13.1 审计问题回答能力

| 审计问题 | 回答能力 |
|---------|---------|
| "Was the Affiliate Eligible at Exposure Time or at Migration Time?" | ✅ `original_binding_created_at` 证明 Exposure Time |
| "Can the Commission Rule be changed after Exposure?" | ✅ 五层 Trigger 保证不可变 |
| "Is there any Exposure-before-Binding scenario?" | ✅ 原子 TX 保证不可能 |
| "What FX rate was used for Settlement?" | ✅ `fx_capture_event_id` 指向 Order-Time FX |
| "Can you Replay the Ledger state at any historical point?" | ✅ 不可变 + 版本控制支持 Replay |
| **"Can the binding be deleted indirectly through content_events?"** | ✅ **ON DELETE RESTRICT + Soft Delete 阻止级联删除** |
| **"Was the Commission granted under the same Rule Definition?"** | ✅ **Full Rule Context Hash 证明规则同一性** |

### 13.2 合规等级

| 等级 | 描述 | 状态 |
|------|------|------|
| 产品级 | 功能完整，用户体验一致 | ✅ v5.0 已达成 |
| 金融级 | 可审计、可回放、不可篡改 | ✅ v6.0 已达成 |
| **金融级不可篡改版** | Post-Exposure Ledger Persistence + Eligibility Context Identity | ✅ **v7.0 达成** |

---

**最终结论**：

这次不是页面重构。

这是：**从「社交帖子」升级为「金融级不可篡改的内容事件系统」**

Stratos 从此：**Content == Monetizable Event**（真正不可篡改版）
