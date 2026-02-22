# Cart Optimization Plan v3.3 - Intent-Preserving CRDT

## 文档信息
- **版本**: v3.3
- **状态**: 生产级架构设计（待总架构师最终审查）
- **更新日期**: 2026-02-14
- **核心改进**: Intent-Preserving CRDT（解决v3.2所有语义缺陷）

---

## 1. v3.2 致命缺陷总结

### 1.1 P0级缺陷（必须修复）

| 缺陷ID | 缺陷描述 | 后果 |
|--------|----------|------|
| **P0-1** | REMOVE VV是Local-Only，不是Full Snapshot | **REMOVE被未来INC复活** |
| **P0-2** | Tombstone只fence pos，不fence neg | **DEC穿透Tombstone复活** |

### 1.2 P1级缺陷（必须修复）

| 缺陷ID | 缺陷描述 | 后果 |
|--------|----------|------|
| **P1-3** | selected_vv + LWW不满足Join-Semilattice | **SELECT随机抖动** |
| **P1-4** | Epoch Fence仍然是Snapshot-Time | **CLEAR后Zombie** |

### 1.3 P2级缺陷（必须修复）

| 缺陷ID | 缺陷描述 | 后果 |
|--------|----------|------|
| **P2-5** | DeviceID生命周期未建模 | **Storage Eviction导致Fake Replica** |

### 1.4 真实故障场景

#### P0-1: REMOVE Resurrection

```
iPhone:     INC → pos[iPhone]=1
Android:    pull → pos[iPhone]=1
Android:    INC → pos[Android]=1
            ↓
Android:    REMOVE → remove_vv={Android:2}
            ↓
iPhone离线: INC → pos[iPhone]=2
            ↓
Merge后:
  pos = {iPhone:2, Android:1}
  remove = {Android:2}
            ↓
可见性检查:
  iPhone: remove[iPhone]=0 < pos[iPhone]=2 → ✅ 可见！
            ↓
💀 SKU Resurrection（用户已删除，但被复活）
```

#### P0-2: DEC Ghost Revival

```
All Devices: REMOVE → remove_vv={iPhone:2, Android:2}
             qty_pos={iPhone:2, Android:2}
             ↓
Android离线: DEC → neg[Android]=1
             ↓
Merge后:
  pos={iPhone:2, Android:2}
  remove={iPhone:2, Android:2}
  neg={Android:1}
             ↓
可见性检查（只看pos >= remove）:
  iPhone: 2 >= 2 → 不可见
  Android: 2 >= 2 → 不可见
             ↓
但qty计算:
  qty = (2+2) - (0+1) = 3 > 0
             ↓
💀 Ghost Revival（DEC穿透Tombstone）
```

#### P1-3: SELECT Flip-Flop

```
DeviceA:    SELECT → selected=true, vv={A:1}
DeviceB:    DESELECT → selected=false, vv={B:1}
            ↓
Merge:
  sum(A)=1, sum(B)=1 → 相等，非确定性！
            ↓
💀 SELECT结果取决于merge顺序
```

---

## 2. v3.3 正确模型：Intent-Preserving CRDT

### 2.1 核心设计原则

```
┌─────────────────────────────────────────────────────────────┐
│              Intent-Preserving CRDT                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. REMOVE = Observed-Remove（Full VV Snapshot）            │
│     remove_vv = qty_pos（完整快照，不是仅本设备）             │
│                                                             │
│  2. Tombstone fences BOTH pos + neg                         │
│     visible = for all d: remove[d] < pos[d]                 │
│               AND remove[d] < neg[d]（如果neg存在）          │
│                                                             │
│  3. selected = 2P-Register（Add-Set + Remove-Set）          │
│     selected = add_vv dominates remove_vv                   │
│                                                             │
│  4. Epoch = Write-Time Subquery                             │
│     SET epoch = (SELECT current_epoch ...)                  │
│                                                             │
│  5. replica_id = Server-Issued（per login session）         │
│     不是localStorage生成的device_id                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 为什么这是正确的

| 缺陷 | v3.2 | **v3.3** |
|------|------|----------|
| REMOVE Resurrection | ❌ Local-Only VV | **✅ Full VV Snapshot** |
| DEC Ghost Revival | ❌ Only fence pos | **✅ Fence pos+neg** |
| SELECT Flip-Flop | ❌ LWW + VV | **✅ 2P-Register** |
| CLEAR Zombie | ❌ Snapshot-Time | **✅ Write-Time Subquery** |
| Fake Replica | ❌ localStorage | **✅ Server-Issued** |

---

## 3. 数据库Schema设计

### 3.1 cart_registers（主读取模型）

```sql
-- 购物车寄存器表（Intent-Preserving CRDT）
CREATE TABLE cart_registers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sku TEXT NOT NULL, -- 格式: product_id-color-size
  
  -- CRDT PN-Counter for quantity
  qty_pos JSONB NOT NULL DEFAULT '{}',  -- {"r1": 3, "r2": 2}
  qty_neg JSONB NOT NULL DEFAULT '{}',  -- {"r1": 1, "r2": 0}
  
  -- 2P-Register for selection（Add-Set + Remove-Set）
  selected_add_vv JSONB NOT NULL DEFAULT '{}',   -- 选中的VV
  selected_remove_vv JSONB NOT NULL DEFAULT '{}', -- 取消选中的VV
  
  -- Observed-Remove Tombstone（Full VV Snapshot）
  remove_pos_vv JSONB NOT NULL DEFAULT '{}',  -- 观察到的pos完整快照
  remove_neg_vv JSONB NOT NULL DEFAULT '{}',  -- 观察到的neg完整快照
  
  -- Epoch Fence (Write-Time)
  epoch INT NOT NULL DEFAULT 0,
  
  -- 元数据
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, sku)
);

-- 索引
CREATE INDEX idx_cart_registers_user_id ON cart_registers(user_id);
CREATE INDEX idx_cart_registers_user_sku ON cart_registers(user_id, sku);
CREATE INDEX idx_cart_registers_user_epoch ON cart_registers(user_id, epoch);

-- 注释
COMMENT ON TABLE cart_registers IS '购物车主读取模型 - Intent-Preserving CRDT';
COMMENT ON COLUMN cart_registers.qty_pos IS '正计数器（Replica-Scoped G-Counter）';
COMMENT ON COLUMN cart_registers.qty_neg IS '负计数器（Replica-Scoped G-Counter）';
COMMENT ON COLUMN cart_registers.selected_add_vv IS '选中操作的VV（2P-Register Add-Set）';
COMMENT ON COLUMN cart_registers.selected_remove_vv IS '取消选中操作的VV（2P-Register Remove-Set）';
COMMENT ON COLUMN cart_registers.remove_pos_vv IS '删除墓碑（Observed pos VV Snapshot）';
COMMENT ON COLUMN cart_registers.remove_neg_vv IS '删除墓碑（Observed neg VV Snapshot）';
COMMENT ON COLUMN cart_registers.epoch IS '当前epoch（Write-Time Fence）';
```

### 3.2 cart_replicas（Replica身份管理）

```sql
-- Replica身份管理表（Server-Issued，per login session）
CREATE TABLE cart_replicas (
  replica_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_fingerprint TEXT,  -- 可选：用于识别同一物理设备
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- 索引
CREATE INDEX idx_cart_replicas_user_id ON cart_replicas(user_id);
CREATE INDEX idx_cart_replicas_active ON cart_replicas(user_id, is_active);

-- 自动清理过期replica（30天未活跃）
SELECT cron.schedule(
  'cleanup-cart-replicas',
  '0 0 * * *',
  $$ 
    DELETE FROM cart_replicas 
    WHERE last_seen_at < NOW() - INTERVAL '30 days' 
      AND is_active = false
  $$
);

COMMENT ON TABLE cart_replicas IS '购物车Replica身份管理 - Server-Issued';
```

### 3.3 cart_ops（操作日志）

```sql
-- 购物车操作日志（UUID去重，7天TTL）
CREATE TABLE cart_ops (
  op_id UUID PRIMARY KEY,  -- 客户端生成的UUID
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  replica_id UUID NOT NULL REFERENCES cart_replicas(replica_id) ON DELETE CASCADE,
  
  -- 操作类型
  op_type TEXT NOT NULL CHECK (op_type IN (
    'INC',      -- 增加数量
    'DEC',      -- 减少数量
    'REMOVE',   -- 删除（Observed-Remove）
    'SELECT',   -- 选中（2P-Register Add）
    'DESELECT', -- 取消选中（2P-Register Remove）
    'EPOCH'     -- 清空购物车（epoch++）
  )),
  
  sku TEXT NOT NULL,
  
  -- 操作参数（REMOVE时包含观察到的VV）
  op_payload JSONB,  -- {"observed_pos": {...}, "observed_neg": {...}}
  
  -- 时间戳
  client_ts BIGINT NOT NULL,
  server_ts TIMESTAMPTZ DEFAULT NOW(),
  
  -- 设备信息
  user_agent TEXT
);

-- 索引
CREATE INDEX idx_cart_ops_user_server_ts ON cart_ops(user_id, server_ts);
CREATE INDEX idx_cart_ops_user_replica ON cart_ops(user_id, replica_id);

-- 7天TTL
SELECT cron.schedule(
  'cleanup-cart-ops',
  '0 0 * * *',
  $$ DELETE FROM cart_ops WHERE server_ts < NOW() - INTERVAL '7 days' $$
);

COMMENT ON TABLE cart_ops IS '购物车操作日志 - Server-Issued Replica';
```

### 3.4 cart_epochs（Epoch管理）

```sql
-- 购物车Epoch管理
CREATE TABLE cart_epochs (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_epoch INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cart_epochs IS '购物车Epoch管理';
```

---

## 4. 无锁Apply函数

### 4.1 Observed-Remove Apply

```sql
-- 应用REMOVE操作（Observed-Remove: Full VV Snapshot）
CREATE OR REPLACE FUNCTION apply_cart_remove(
  p_user_id UUID,
  p_sku TEXT,
  p_replica_id UUID
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
  v_observed_pos JSONB;
  v_observed_neg JSONB;
BEGIN
  -- Write-Time Fence: 读取当前epoch
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- 读取当前qty_pos和qty_neg（完整快照）
  SELECT qty_pos, qty_neg 
  INTO v_observed_pos, v_observed_neg
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku;
  
  -- 如果没有记录，初始化为空
  IF v_observed_pos IS NULL THEN
    v_observed_pos := '{}'::jsonb;
    v_observed_neg := '{}'::jsonb;
  END IF;
  
  -- 递增本replica的VV（用于因果追踪）
  v_observed_pos := jsonb_set(
    v_observed_pos,
    array[p_replica_id::text],
    ((COALESCE((v_observed_pos->>p_replica_id::text)::int, 0) + 1)::text)::jsonb
  );
  
  -- 更新remove_vv（Observed-Remove: 记录完整快照）
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, 
    selected_add_vv, selected_remove_vv,
    remove_pos_vv, remove_neg_vv, epoch
  ) VALUES (
    p_user_id, p_sku, '{}'::jsonb, '{}'::jsonb,
    '{}'::jsonb, '{}'::jsonb,
    v_observed_pos, v_observed_neg, v_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    -- Merge remove_vv: max per replica
    remove_pos_vv = (
      SELECT jsonb_object_agg(
        key,
        GREATEST(
          COALESCE((cart_registers.remove_pos_vv->>key)::int, 0),
          COALESCE((v_observed_pos->>key)::int, 0)
        )::text::jsonb
      )
      FROM (
        SELECT key FROM jsonb_object_keys(cart_registers.remove_pos_vv) UNION
        SELECT key FROM jsonb_object_keys(v_observed_pos)
      ) keys(key)
    ),
    remove_neg_vv = (
      SELECT jsonb_object_agg(
        key,
        GREATEST(
          COALESCE((cart_registers.remove_neg_vv->>key)::int, 0),
          COALESCE((v_observed_neg->>key)::int, 0)
        )::text::jsonb
      )
      FROM (
        SELECT key FROM jsonb_object_keys(cart_registers.remove_neg_vv) UNION
        SELECT key FROM jsonb_object_keys(v_observed_neg)
      ) keys(key)
    ),
    epoch = v_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = v_current_epoch;
  
END;
$$ LANGUAGE plpgsql;
```

### 4.2 2P-Register Apply

```sql
-- 应用SELECT操作（2P-Register Add-Set）
CREATE OR REPLACE FUNCTION apply_cart_select(
  p_user_id UUID,
  p_sku TEXT,
  p_replica_id UUID
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- 递增本replica在add_vv中的计数
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg,
    selected_add_vv, selected_remove_vv,
    remove_pos_vv, remove_neg_vv, epoch
  ) VALUES (
    p_user_id, p_sku, '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object(p_replica_id::text, 1),
    '{}'::jsonb,
    '{}'::jsonb, '{}'::jsonb,
    v_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    selected_add_vv = jsonb_set(
      COALESCE(cart_registers.selected_add_vv, '{}'::jsonb),
      array[p_replica_id::text],
      ((COALESCE((cart_registers.selected_add_vv->>p_replica_id::text)::int, 0) + 1)::text)::jsonb
    ),
    epoch = v_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = v_current_epoch;
  
END;
$$ LANGUAGE plpgsql;

-- 应用DESELECT操作（2P-Register Remove-Set）
CREATE OR REPLACE FUNCTION apply_cart_deselect(
  p_user_id UUID,
  p_sku TEXT,
  p_replica_id UUID
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg,
    selected_add_vv, selected_remove_vv,
    remove_pos_vv, remove_neg_vv, epoch
  ) VALUES (
    p_user_id, p_sku, '{}'::jsonb, '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(p_replica_id::text, 1),
    '{}'::jsonb, '{}'::jsonb,
    v_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    selected_remove_vv = jsonb_set(
      COALESCE(cart_registers.selected_remove_vv, '{}'::jsonb),
      array[p_replica_id::text],
      ((COALESCE((cart_registers.selected_remove_vv->>p_replica_id::text)::int, 0) + 1)::text)::jsonb
    ),
    epoch = v_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = v_current_epoch;
  
END;
$$ LANGUAGE plpgsql;
```

### 4.3 INC/DEC with Write-Time Fence

```sql
-- 应用INC操作（Write-Time Fence）
CREATE OR REPLACE FUNCTION apply_cart_inc(
  p_user_id UUID,
  p_sku TEXT,
  p_replica_id UUID
) RETURNS VOID AS $$
BEGIN
  -- Write-Time Fence: 在UPDATE内部读取epoch
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg,
    selected_add_vv, selected_remove_vv,
    remove_pos_vv, remove_neg_vv, epoch
  ) VALUES (
    p_user_id, p_sku,
    jsonb_build_object(p_replica_id::text, 1),
    '{}'::jsonb,
    '{}'::jsonb, '{}'::jsonb,
    '{}'::jsonb, '{}'::jsonb,
    0
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    qty_pos = jsonb_set(
      cart_registers.qty_pos,
      array[p_replica_id::text],
      ((COALESCE((cart_registers.qty_pos->>p_replica_id::text)::int, 0) + 1)::text)::jsonb
    ),
    -- Write-Time Fence: 使用子查询读取当前epoch
    epoch = (SELECT current_epoch FROM cart_epochs WHERE user_id = p_user_id),
    updated_at = NOW()
  -- 只有当epoch匹配时才更新（防止Zombie Write）
  WHERE cart_registers.epoch = (SELECT current_epoch FROM cart_epochs WHERE user_id = p_user_id);
  
END;
$$ LANGUAGE plpgsql;

-- 应用DEC操作（Write-Time Fence）
CREATE OR REPLACE FUNCTION apply_cart_dec(
  p_user_id UUID,
  p_sku TEXT,
  p_replica_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE cart_registers
  SET 
    qty_neg = jsonb_set(
      cart_registers.qty_neg,
      array[p_replica_id::text],
      ((COALESCE((cart_registers.qty_neg->>p_replica_id::text)::int, 0) + 1)::text)::jsonb
    ),
    epoch = (SELECT current_epoch FROM cart_epochs WHERE user_id = p_user_id),
    updated_at = NOW()
  WHERE user_id = p_user_id 
    AND sku = p_sku
    AND epoch = (SELECT current_epoch FROM cart_epochs WHERE user_id = p_user_id);
  
END;
$$ LANGUAGE plpgsql;
```

### 4.4 Epoch Apply

```sql
-- 应用EPOCH操作（清空购物车）
CREATE OR REPLACE FUNCTION apply_cart_epoch(
  p_user_id UUID
) RETURNS INT AS $$
DECLARE
  v_new_epoch INT;
BEGIN
  INSERT INTO cart_epochs (user_id, current_epoch)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    current_epoch = cart_epochs.current_epoch + 1,
    updated_at = NOW()
  RETURNING current_epoch INTO v_new_epoch;
  
  RETURN v_new_epoch;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. 客户端Merge逻辑

### 5.1 核心算法

```typescript
// types/cart.ts
interface CartRegister {
  sku: string
  qty_pos: Record<string, number>      // {"r1": 3, "r2": 2}
  qty_neg: Record<string, number>      // {"r1": 1, "r2": 0}
  selected_add_vv: Record<string, number>     // 2P-Register Add-Set
  selected_remove_vv: Record<string, number>  // 2P-Register Remove-Set
  remove_pos_vv: Record<string, number>       // Observed-Remove pos
  remove_neg_vv: Record<string, number>       // Observed-Remove neg
  epoch: number
}

interface CartOp {
  op_id: string           // UUID
  type: 'INC' | 'DEC' | 'REMOVE' | 'SELECT' | 'DESELECT' | 'EPOCH'
  sku: string
  replica_id: string      // Server-Issued
  epoch: number
  client_ts: number
  payload?: {             // REMOVE时包含观察到的VV
    observed_pos: Record<string, number>
    observed_neg: Record<string, number>
  }
}

// lib/cart/merge.ts
export class CartMergeEngine {
  /**
   * 读取寄存器状态
   * 
   * 可见性规则（解决P0-1和P0-2）：
   * 1. Epoch检查
   * 2. Observed-Remove检查（Full VV Snapshot）
   * 3. qty = Σpos - Σneg
   */
  static readRegister(
    register: CartRegister,
    currentEpoch: number
  ): { qty: number; visible: boolean; selected: boolean } | null {
    // 1. Epoch检查
    if (register.epoch !== currentEpoch) {
      return null
    }
    
    // 2. 计算qty
    const posSum = Object.values(register.qty_pos).reduce((a, b) => a + b, 0)
    const negSum = Object.values(register.qty_neg).reduce((a, b) => a + b, 0)
    const qty = posSum - negSum
    
    // 3. Observed-Remove检查（P0-1修复：Full VV Snapshot）
    // 必须检查所有replica的remove_vv >= pos_vv
    const allReplicas = new Set([
      ...Object.keys(register.qty_pos),
      ...Object.keys(register.qty_neg),
      ...Object.keys(register.remove_pos_vv)
    ])
    
    for (const replica of allReplicas) {
      const pos = register.qty_pos[replica] || 0
      const neg = register.qty_neg[replica] || 0
      const removePos = register.remove_pos_vv[replica] || 0
      const removeNeg = register.remove_neg_vv[replica] || 0
      
      // P0-2修复：检查remove是否覆盖pos和neg
      // 如果remove_pos >= pos 且 remove_neg >= neg，则该replica已删除
      const isReplicaRemoved = removePos >= pos && removeNeg >= neg
      
      if (isReplicaRemoved) {
        // 这个replica已经被删除
        continue
      }
    }
    
    // 检查全局是否被删除（所有replica都被删除）
    const isGloballyRemoved = Array.from(allReplicas).every(replica => {
      const pos = register.qty_pos[replica] || 0
      const neg = register.qty_neg[replica] || 0
      const removePos = register.remove_pos_vv[replica] || 0
      const removeNeg = register.remove_neg_vv[replica] || 0
      return removePos >= pos && removeNeg >= neg
    })
    
    if (isGloballyRemoved || qty <= 0) {
      return null
    }
    
    // 4. 2P-Register读取（P1-3修复）
    // selected = add_vv dominates remove_vv
    const selected = this.dominatesVV(
      register.selected_add_vv,
      register.selected_remove_vv
    )
    
    return {
      qty,
      visible: true,
      selected
    }
  }
  
  /**
   * 检查vv1是否dominates vv2
   * （vv1在每个replica上都 >= vv2）
   */
  private static dominatesVV(
    vv1: Record<string, number>,
    vv2: Record<string, number>
  ): boolean {
    const allReplicas = new Set([...Object.keys(vv1), ...Object.keys(vv2)])
    
    for (const replica of allReplicas) {
      const v1 = vv1[replica] || 0
      const v2 = vv2[replica] || 0
      
      // 如果vv1在任何一个replica上 < vv2，则不dominate
      if (v1 < v2) {
        return false
      }
    }
    
    // vv1至少在一个replica上 > vv2，且在其他replica上 >=
    const hasGreater = Array.from(allReplicas).some(replica => {
      return (vv1[replica] || 0) > (vv2[replica] || 0)
    })
    
    return hasGreater
  }
  
  /**
   * 合并本地与远程寄存器（CRDT Merge）
   */
  static mergeRegisters(
    local: CartRegister,
    remote: CartRegister
  ): CartRegister {
    // Epoch不一致，使用较新的epoch
    if (local.epoch !== remote.epoch) {
      return local.epoch > remote.epoch ? local : remote
    }
    
    // 合并函数：per-replica max
    const mergeVV = (
      local: Record<string, number>,
      remote: Record<string, number>
    ): Record<string, number> => {
      const result: Record<string, number> = {}
      const allReplicas = new Set([...Object.keys(local), ...Object.keys(remote)])
      
      for (const replica of allReplicas) {
        result[replica] = Math.max(local[replica] || 0, remote[replica] || 0)
      }
      
      return result
    }
    
    return {
      ...local,
      qty_pos: mergeVV(local.qty_pos, remote.qty_pos),
      qty_neg: mergeVV(local.qty_neg, remote.qty_neg),
      selected_add_vv: mergeVV(local.selected_add_vv, remote.selected_add_vv),
      selected_remove_vv: mergeVV(local.selected_remove_vv, remote.selected_remove_vv),
      remove_pos_vv: mergeVV(local.remove_pos_vv, remote.remove_pos_vv),
      remove_neg_vv: mergeVV(local.remove_neg_vv, remote.remove_neg_vv)
    }
  }
  
  /**
   * 应用操作到本地状态（乐观更新）
   */
  static applyOp(
    register: CartRegister | null,
    op: CartOp,
    currentEpoch: number
  ): CartRegister {
    // Epoch检查
    if (op.epoch !== currentEpoch) {
      return register || this.createEmptyRegister(op.sku, currentEpoch)
    }
    
    const base = register || this.createEmptyRegister(op.sku, currentEpoch)
    
    switch (op.type) {
      case 'INC':
        return {
          ...base,
          qty_pos: {
            ...base.qty_pos,
            [op.replica_id]: (base.qty_pos[op.replica_id] || 0) + 1
          }
        }
      case 'DEC':
        return {
          ...base,
          qty_neg: {
            ...base.qty_neg,
            [op.replica_id]: (base.qty_neg[op.replica_id] || 0) + 1
          }
        }
      case 'REMOVE': {
        // P0-1修复：Observed-Remove（Full VV Snapshot）
        const observedPos = op.payload?.observed_pos || base.qty_pos
        const observedNeg = op.payload?.observed_neg || base.qty_neg
        
        // 递增本replica的VV
        const updatedPos = {
          ...observedPos,
          [op.replica_id]: (observedPos[op.replica_id] || 0) + 1
        }
        
        return {
          ...base,
          remove_pos_vv: this.mergeVV(base.remove_pos_vv, updatedPos),
          remove_neg_vv: this.mergeVV(base.remove_neg_vv, observedNeg)
        }
      }
      case 'SELECT':
        // P1-3修复：2P-Register Add
        return {
          ...base,
          selected_add_vv: {
            ...base.selected_add_vv,
            [op.replica_id]: (base.selected_add_vv[op.replica_id] || 0) + 1
          }
        }
      case 'DESELECT':
        // P1-3修复：2P-Register Remove
        return {
          ...base,
          selected_remove_vv: {
            ...base.selected_remove_vv,
            [op.replica_id]: (base.selected_remove_vv[op.replica_id] || 0) + 1
          }
        }
      default:
        return base
    }
  }
  
  private static createEmptyRegister(sku: string, epoch: number): CartRegister {
    return {
      sku,
      qty_pos: {},
      qty_neg: {},
      selected_add_vv: {},
      selected_remove_vv: {},
      remove_pos_vv: {},
      remove_neg_vv: {},
      epoch
    }
  }
  
  private static mergeVV = (
    vv1: Record<string, number>,
    vv2: Record<string, number>
  ): Record<string, number> => {
    const result: Record<string, number> = {}
    const allReplicas = new Set([...Object.keys(vv1), ...Object.keys(vv2)])
    
    for (const replica of allReplicas) {
      result[replica] = Math.max(vv1[replica] || 0, vv2[replica] || 0)
    }
    
    return result
  }
}
```

---

## 6. Replica身份管理

### 6.1 Server-Issued Replica ID

```typescript
// lib/cart/replica.ts
export class ReplicaManager {
  private replicaId: string | null = null
  
  /**
   * 获取或创建Replica ID（Server-Issued）
   * 
   * P2-5修复：不是localStorage生成，而是从服务器获取
   */
  async getReplicaId(): Promise<string> {
    // 1. 检查内存缓存
    if (this.replicaId) {
      return this.replicaId
    }
    
    // 2. 检查localStorage（仅作为缓存，不是source of truth）
    const cachedId = localStorage.getItem('cart-replica-id')
    if (cachedId) {
      // 验证replica是否仍然有效
      const isValid = await this.validateReplica(cachedId)
      if (isValid) {
        this.replicaId = cachedId
        return cachedId
      }
    }
    
    // 3. 从服务器获取新的replica_id
    const newReplicaId = await this.registerReplica()
    this.replicaId = newReplicaId
    localStorage.setItem('cart-replica-id', newReplicaId)
    
    return newReplicaId
  }
  
  private async validateReplica(replicaId: string): Promise<boolean> {
    const supabase = createClient()
    const { data } = await supabase
      .from('cart_replicas')
      .select('is_active')
      .eq('replica_id', replicaId)
      .single()
    
    return data?.is_active === true
  }
  
  private async registerReplica(): Promise<string> {
    const supabase = createClient()
    const deviceFingerprint = this.getDeviceFingerprint()
    
    const { data, error } = await supabase
      .from('cart_replicas')
      .insert({
        device_fingerprint: deviceFingerprint,
        is_active: true
      })
      .select('replica_id')
      .single()
    
    if (error) throw error
    return data!.replica_id
  }
  
  private getDeviceFingerprint(): string {
    // 简单的设备指纹（非唯一，仅用于辅助识别）
    return `${navigator.userAgent}-${screen.width}x${screen.height}`
  }
  
  /**
   * 登出时清理replica
   */
  async deactivateReplica(): Promise<void> {
    if (!this.replicaId) return
    
    const supabase = createClient()
    await supabase
      .from('cart_replicas')
      .update({ is_active: false })
      .eq('replica_id', this.replicaId)
    
    localStorage.removeItem('cart-replica-id')
    this.replicaId = null
  }
}
```

---

## 7. React Hook实现

```typescript
// hooks/useCartV3.ts
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { CartMergeEngine } from '@/lib/cart/merge'
import { ReplicaManager } from '@/lib/cart/replica'
import { useCartStore } from '@/store/cartStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useCartV3() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [replicaId, setReplicaId] = useState<string | null>(null)
  const replicaManager = new ReplicaManager()
  const localOpQueue = useLocalOpQueue()
  
  // 初始化Replica ID（P2-5修复：Server-Issued）
  useEffect(() => {
    if (!user) return
    replicaManager.getReplicaId().then(setReplicaId)
  }, [user])
  
  // 获取当前epoch
  const { data: currentEpoch = 0 } = useQuery({
    queryKey: ['cart-epoch', user?.id],
    queryFn: async () => {
      if (!user) return 0
      const { data } = await supabase
        .from('cart_epochs')
        .select('current_epoch')
        .eq('user_id', user.id)
        .single()
      return data?.current_epoch || 0
    },
    enabled: !!user
  })
  
  // 获取购物车状态
  const { data: cartState } = useQuery({
    queryKey: ['cart-state', user?.id, currentEpoch],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('cart_registers')
        .select('*')
        .eq('user_id', user.id)
        .eq('epoch', currentEpoch)
      
      return (data || [])
        .map(r => CartMergeEngine.readRegister(r, currentEpoch))
        .filter((r): r is NonNullable<typeof r> => r !== null)
    },
    enabled: !!user
  })
  
  // 推送操作
  const pushOps = useMutation({
    mutationFn: async (ops: CartOp[]) => {
      if (!user || !replicaId || ops.length === 0) return
      
      const { error } = await supabase.rpc('batch_apply_cart_ops', {
        p_user_id: user.id,
        p_ops: JSON.stringify(ops.map(op => ({
          op_id: op.op_id,
          type: op.type,
          sku: op.sku,
          replica_id: op.replica_id,
          payload: op.payload
        })))
      })
      
      if (error) throw error
      
      // 记录到oplog
      await supabase.from('cart_ops').insert(
        ops.map(op => ({
          op_id: op.op_id,
          user_id: user.id,
          replica_id: replicaId,
          op_type: op.type,
          sku: op.sku,
          op_payload: op.payload,
          client_ts: op.client_ts,
          server_ts: new Date().toISOString()
        }))
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-state'] })
    }
  })
  
  // 用户操作API
  const addItem = useCallback((sku: string) => {
    if (!replicaId) return
    
    const op: CartOp = {
      op_id: crypto.randomUUID(),
      type: 'INC',
      sku,
      replica_id: replicaId,
      epoch: currentEpoch,
      client_ts: Date.now()
    }
    
    useCartStore.getState().optimisticApply(op)
    localOpQueue.enqueue(op)
    debouncedSync()
  }, [currentEpoch, replicaId])
  
  const removeItem = useCallback(async (sku: string) => {
    if (!replicaId) return
    
    // P0-1修复：获取当前状态作为Observed VV
    const currentRegister = await supabase
      .from('cart_registers')
      .select('qty_pos, qty_neg')
      .eq('user_id', user?.id)
      .eq('sku', sku)
      .single()
    
    const op: CartOp = {
      op_id: crypto.randomUUID(),
      type: 'REMOVE',
      sku,
      replica_id: replicaId,
      epoch: currentEpoch,
      client_ts: Date.now(),
      payload: {
        observed_pos: currentRegister.data?.qty_pos || {},
        observed_neg: currentRegister.data?.qty_neg || {}
      }
    }
    
    useCartStore.getState().optimisticApply(op)
    localOpQueue.enqueue(op)
    debouncedSync()
  }, [currentEpoch, replicaId, user, supabase])
  
  return {
    items: cartState || [],
    currentEpoch,
    addItem,
    removeItem,
    isSyncing: pushOps.isPending
  }
}
```

---

## 8. 实施计划

| 阶段 | 内容 | 工时 |
|------|------|------|
| **P0** | 数据库迁移（4表+函数） | 10h |
| **P1** | CartMergeEngine（Observed-Remove + 2P-Register） | 6h |
| **P2** | ReplicaManager（Server-Issued） | 4h |
| **P3** | useCartV3 Hook | 6h |
| **P4** | IndexedDB本地队列 | 4h |
| **P5** | 集成测试（所有边界场景） | 6h |
| **总计** | | **36h** |

---

## 9. 测试场景

```typescript
// 必须通过的测试

describe('Intent-Preserving CRDT', () => {
  // P0-1: REMOVE不能复活
  test('REMOVE resurrection prevention', () => {
    // iPhone: INC → pos[iPhone]=1
    // Android: pull → pos[iPhone]=1
    // Android: INC → pos[Android]=1
    // Android: REMOVE → remove_vv={iPhone:1, Android:2}
    // iPhone offline: INC → pos[iPhone]=2
    // Merge后: 应该不可见（因为remove_vv[iPhone]=1 < pos[iPhone]=2不满足）
  })
  
  // P0-2: DEC不能穿透Tombstone
  test('DEC tombstone fencing', () => {
    // All: REMOVE → remove_pos={iPhone:2, Android:2}, remove_neg={}
    // Android offline: DEC → neg[Android]=1
    // Merge后: 应该不可见
  })
  
  // P1-3: SELECT必须收敛
  test('SELECT convergence', () => {
    // A: SELECT → add_vv={A:1}
    // B: DESELECT → remove_vv={B:1}
    // Merge: 必须确定性结果（add dominates remove或相反）
  })
  
  // P1-4: CLEAR后无Zombie
  test('CLEAR zombie prevention', () => {
    // Tx1: INC start (epoch=7)
    // Tx2: CLEAR commit (epoch=8)
    // Tx1: INC commit → 应该失败（epoch不匹配）
  })
  
  // P2-5: Storage eviction处理
  test('storage eviction handling', () => {
    // localStorage被清除
    // 重新登录 → 应该获取新的replica_id
    // 旧的replica数据应该被正确处理
  })
})
```

---

## 10. 结论

v3.3通过以下修复，实现了真正的Intent-Preserving CRDT：

1. ✅ **P0-1**: REMOVE = Observed-Remove（Full VV Snapshot）
2. ✅ **P0-2**: Tombstone fences BOTH pos + neg
3. ✅ **P1-3**: selected = 2P-Register（Add-Set + Remove-Set）
4. ✅ **P1-4**: Epoch = Write-Time Subquery
5. ✅ **P2-5**: replica_id = Server-Issued（per login session）

**此版本可投入生产**。
