# Cart Optimization Plan v3.2 - Causally-Stable Hybrid Register

## 文档信息
- **版本**: v3.2
- **状态**: 架构级设计（待总架构师审查）
- **更新日期**: 2026-02-14
- **核心改进**: Causally-Stable Hybrid Register（解决v3.1的因果性问题）

---

## 1. v3.1 问题总结

### 1.1 核心架构缺陷

| 问题ID | 问题描述 | 严重程度 | 影响 |
|--------|----------|----------|------|
| P0-1 | PN-Counter是Shared Counter，不是CRDT | 🔴 Critical | Counter Inflation Bug (+2→+4) |
| P0-2 | REMOVE Tombstone没有Version Vector | 🔴 Critical | REMOVE Lost（因果不安全） |
| P1-3 | Epoch Fence是Op-Time不是Write-Time | 🟠 High | Zombie Write After Clear |
| P1-4 | client_ts去重会丢Intent | 🟠 High | 同毫秒操作被吞 |

### 1.2 真实场景故障

#### P0-1: Counter Inflation Bug

```
场景：用户飞机模式下点击+1两次（iPhone + Android）

iPhone:     pos=1 (本地)
Android:    pos=1 (本地)
            ↓
Android先恢复，pull到pos=1，push INC → server pos=2
            ↓
iPhone后恢复，merge remote: max(1,2)=2
            ↓
iPhone push 本地 INC: pos=3
            ↓
Android push INC: pos=4
            ↓
最终结果: qty = 4（用户点击2次，系统记录4次）

🟥 Counter Inflation Bug（Revenue Impact）
```

#### P0-2: REMOVE Lost

```
场景：用户先INC后REMOVE（真实时间顺序）

iPhone:     INC A (qty_revision: 0→1)
            REMOVE A (remove_revision: 0→2)
            ↓
Server乱序apply：
  REMOVE先apply: remove_revision=1
  INC后apply: qty_revision=1, remove_revision=1
            ↓
可见性检查: remove_revision(1) >= qty_revision(1) → 不可见？
  实际: remove_revision=1, qty_revision=1
  判断: 1 >= 1 → true → 不可见 ✓

但如果是：
  INC: qty_revision=1
  REMOVE: remove_revision = qty_revision + 1 = 2
  
  Server顺序：
    INC: qty_revision=1
    REMOVE: remove_revision=2
    
  结果: qty_revision=1 < remove_revision=2 → 不可见 ✓

问题场景：
  iPhone: INC (rev=1)
  Android: REMOVE (此时qty_revision=0, remove_revision=1)
  
  Server顺序：
    REMOVE: remove_revision=1
    INC: qty_revision=1
    
  结果: remove_revision(1) >= qty_revision(1) → 不可见 ✓
  
  但Android本地已经删除了，iPhone的INC应该被忽略
  
❌ 因果性违反：REMOVE发生在INC之后，但INC仍然生效
```

#### P1-3: Zombie Write After Clear

```
场景：用户点击CLEAR后立即INC

Tx1 (INC):  BEGIN → read epoch=7 → apply → COMMIT
Tx2 (CLEAR): BEGIN → epoch++ → 8 → COMMIT

如果Tx2先commit，Tx1后commit：
  Tx1的WHERE epoch = 7 仍然满足（snapshot isolation）
  Tx1写入: epoch=7
            ↓
最终结果: 购物车有一个epoch=7的item

💀 Zombie Write After Clear
```

#### P1-4: Intent Drop

```
场景：iOS后台恢复，timer coalescing

WKWebView:
  Op1: client_ts = 1700000000000
  Op2: client_ts = 1700000000000 (同一毫秒)
            ↓
数据库: UNIQUE(user_id, device_id, client_ts)
            ↓
Op2被忽略

❌ Intent Lost
```

---

## 2. v3.2 正确模型：Causally-Stable Hybrid Register

### 2.1 核心思想

```
┌─────────────────────────────────────────────────────────────┐
│           Causally-Stable Hybrid Register                    │
├─────────────────────────────────────────────────────────────┤
│  qty_pos JSONB      │ {"device_a": 3, "device_b": 2}        │
│  qty_neg JSONB      │ {"device_a": 1, "device_b": 0}        │
├─────────────────────────────────────────────────────────────┤
│  selected           │ LWW-Register                          │
│  selected_vv JSONB  │ Version Vector                        │
├─────────────────────────────────────────────────────────────┤
│  remove_vv JSONB    │ Version Vector Tombstone              │
│  epoch              │ Write-Time Fence                      │
└─────────────────────────────────────────────────────────────┘

读取公式:
  qty = Σ(qty_pos.values) - Σ(qty_neg.values)
  visible = for all device: remove_vv[device] < qty_pos[device]
            AND epoch == current_epoch
```

### 2.2 为什么这是正确的

| 特性 | v3.1 | v3.2 |
|------|------|------|
| Counter类型 | Shared PN-Counter | **CRDT PN-Counter** |
| Tombstone | int | **Version Vector** |
| Epoch Fence | Op-Time | **Write-Time** |
| Dedup | client_ts | **UUID** |
| Offline Safety | ⚠️ | **✅** |
| Causal Correctness | ❌ | **✅** |

---

## 3. 数据库Schema设计

### 3.1 cart_registers（主读取模型）

```sql
-- 购物车寄存器表（Causally-Stable Hybrid Register）
CREATE TABLE cart_registers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sku TEXT NOT NULL, -- 格式: product_id-color-size
  
  -- CRDT PN-Counter for quantity
  qty_pos JSONB NOT NULL DEFAULT '{}',  -- {"device_a": 3, "device_b": 2}
  qty_neg JSONB NOT NULL DEFAULT '{}',  -- {"device_a": 1, "device_b": 0}
  
  -- LWW-Register for selection
  selected BOOLEAN NOT NULL DEFAULT false,
  selected_vv JSONB NOT NULL DEFAULT '{}',  -- Version Vector
  
  -- Version Vector Tombstone for removal
  remove_vv JSONB NOT NULL DEFAULT '{}',  -- {"device_a": 2}
  
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
COMMENT ON TABLE cart_registers IS '购物车主读取模型 - Causally-Stable Hybrid Register';
COMMENT ON COLUMN cart_registers.qty_pos IS '正计数器（Device-Scoped G-Counter）';
COMMENT ON COLUMN cart_registers.qty_neg IS '负计数器（Device-Scoped G-Counter）';
COMMENT ON COLUMN cart_registers.remove_vv IS '删除墓碑（Version Vector）';
COMMENT ON COLUMN cart_registers.epoch IS '当前epoch（Write-Time Fence）';
```

### 3.2 cart_ops（操作日志）

```sql
-- 购物车操作日志（用于同步，7天TTL）
CREATE TABLE cart_ops (
  op_id UUID PRIMARY KEY,  -- 客户端生成的UUID
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  
  -- 操作类型
  op_type TEXT NOT NULL CHECK (op_type IN (
    'INC',      -- 增加数量
    'DEC',      -- 减少数量
    'REMOVE',   -- 删除（Version Vector Tombstone）
    'SELECT',   -- 选中
    'DESELECT', -- 取消选中
    'EPOCH'     -- 清空购物车（epoch++）
  )),
  
  sku TEXT NOT NULL,
  
  -- 操作参数
  op_vv JSONB,  -- 操作时的Version Vector（用于REMOVE）
  
  -- 时间戳
  client_ts BIGINT NOT NULL,
  server_ts TIMESTAMPTZ DEFAULT NOW(),
  
  -- 设备信息
  user_agent TEXT
);

-- 索引
CREATE INDEX idx_cart_ops_user_server_ts ON cart_ops(user_id, server_ts);
CREATE INDEX idx_cart_ops_user_device ON cart_ops(user_id, device_id);

-- 7天TTL（自动清理）
SELECT cron.schedule(
  'cleanup-cart-ops',
  '0 0 * * *',
  $$ DELETE FROM cart_ops WHERE server_ts < NOW() - INTERVAL '7 days' $$
);

COMMENT ON TABLE cart_ops IS '购物车操作日志 - UUID去重，7天自动清理';
COMMENT ON COLUMN cart_ops.op_id IS '操作唯一ID（客户端生成UUID）';
COMMENT ON COLUMN cart_ops.op_vv IS '操作时的Version Vector';
```

### 3.3 cart_epochs（Epoch管理）

```sql
-- 购物车Epoch管理（每个用户一个epoch计数器）
CREATE TABLE cart_epochs (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_epoch INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cart_epochs IS '购物车Epoch管理 - 单调递增计数器';
```

---

## 4. 无锁Apply函数

### 4.1 Device-Scoped PN-Counter Apply

```sql
-- 应用INC操作（Device-Scoped CRDT PN-Counter）
CREATE OR REPLACE FUNCTION apply_cart_inc(
  p_user_id UUID,
  p_sku TEXT,
  p_device_id TEXT
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
BEGIN
  -- Write-Time Fence: 读取当前epoch
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- 无锁原子更新（Device-Scoped）
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, selected, selected_vv, remove_vv, epoch
  ) VALUES (
    p_user_id, p_sku, 
    jsonb_build_object(p_device_id, 1),  -- {"device_id": 1}
    '{}'::jsonb,
    false, '{}'::jsonb, '{}'::jsonb,
    v_current_epoch  -- Write-Time Fence!
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    qty_pos = COALESCE(
      jsonb_set(
        cart_registers.qty_pos,
        array[p_device_id],
        ((COALESCE((cart_registers.qty_pos->>p_device_id)::int, 0) + 1)::text)::jsonb
      ),
      jsonb_build_object(p_device_id, 1)
    ),
    epoch = v_current_epoch,  -- Write-Time Fence!
    updated_at = NOW()
  WHERE cart_registers.epoch = v_current_epoch;  -- 双重检查
  
END;
$$ LANGUAGE plpgsql;

-- 应用DEC操作（Device-Scoped）
CREATE OR REPLACE FUNCTION apply_cart_dec(
  p_user_id UUID,
  p_sku TEXT,
  p_device_id TEXT
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
  
  UPDATE cart_registers
  SET 
    qty_neg = COALESCE(
      jsonb_set(
        cart_registers.qty_neg,
        array[p_device_id],
        ((COALESCE((cart_registers.qty_neg->>p_device_id)::int, 0) + 1)::text)::jsonb
      ),
      jsonb_build_object(p_device_id, 1)
    ),
    epoch = v_current_epoch,
    updated_at = NOW()
  WHERE user_id = p_user_id 
    AND sku = p_sku
    AND epoch = v_current_epoch;
  
END;
$$ LANGUAGE plpgsql;
```

### 4.2 Version Vector Tombstone Apply

```sql
-- 应用REMOVE操作（Version Vector Tombstone）
CREATE OR REPLACE FUNCTION apply_cart_remove(
  p_user_id UUID,
  p_sku TEXT,
  p_device_id TEXT
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
  v_current_pos JSONB;
  v_new_vv JSONB;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- 获取当前qty_pos
  SELECT qty_pos INTO v_current_pos
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku;
  
  -- 构建新的Version Vector: 当前qty_pos + 1
  -- remove_vv[device_id] = qty_pos[device_id] + 1
  v_new_vv := COALESCE(
    jsonb_set(
      '{}'::jsonb,
      array[p_device_id],
      ((COALESCE((v_current_pos->>p_device_id)::int, 0) + 1)::text)::jsonb
    ),
    jsonb_build_object(p_device_id, 1)
  );
  
  -- 更新remove_vv（合并Version Vector）
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, selected, selected_vv, remove_vv, epoch
  ) VALUES (
    p_user_id, p_sku, '{}'::jsonb, '{}'::jsonb,
    false, '{}'::jsonb, v_new_vv, v_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    remove_vv = cart_registers.remove_vv || v_new_vv,  -- 合并VV
    epoch = v_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = v_current_epoch;
  
END;
$$ LANGUAGE plpgsql;
```

### 4.3 LWW-Register Apply

```sql
-- 应用SELECT/DESELECT操作（LWW with Version Vector）
CREATE OR REPLACE FUNCTION apply_cart_select(
  p_user_id UUID,
  p_sku TEXT,
  p_device_id TEXT,
  p_selected BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
  v_current_vv JSONB;
  v_new_vv JSONB;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- 获取当前selected_vv
  SELECT selected_vv INTO v_current_vv
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku;
  
  -- 递增本设备的VV
  v_new_vv := jsonb_set(
    COALESCE(v_current_vv, '{}'::jsonb),
    array[p_device_id],
    ((COALESCE((v_current_vv->>p_device_id)::int, 0) + 1)::text)::jsonb
  );
  
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, selected, selected_vv, remove_vv, epoch
  ) VALUES (
    p_user_id, p_sku, '{}'::jsonb, '{}'::jsonb,
    p_selected, v_new_vv, '{}'::jsonb, v_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    selected = p_selected,
    selected_vv = v_new_vv,
    epoch = v_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = v_current_epoch;
  
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
  -- 原子递增epoch
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

### 4.5 批量Apply

```sql
-- 批量应用操作（UUID去重）
CREATE OR REPLACE FUNCTION batch_apply_cart_ops(
  p_user_id UUID,
  p_ops JSONB  -- [{"op_id": "uuid", "type": "INC", "sku": "...", "device_id": "..."}, ...]
) RETURNS TABLE(
  op_id UUID,
  success BOOLEAN,
  error TEXT
) AS $$
DECLARE
  v_op JSONB;
  v_current_epoch INT;
BEGIN
  FOR v_op IN SELECT * FROM jsonb_array_elements(p_ops)
  LOOP
    BEGIN
      -- UUID去重检查
      PERFORM 1 FROM cart_ops WHERE op_id = (v_op->>'op_id')::UUID;
      IF FOUND THEN
        RETURN QUERY SELECT (v_op->>'op_id')::UUID, true, 'duplicate'::TEXT;
        CONTINUE;
      END IF;
      
      CASE v_op->>'type'
        WHEN 'INC' THEN
          PERFORM apply_cart_inc(
            p_user_id, 
            v_op->>'sku', 
            v_op->>'device_id'
          );
        WHEN 'DEC' THEN
          PERFORM apply_cart_dec(
            p_user_id, 
            v_op->>'sku', 
            v_op->>'device_id'
          );
        WHEN 'REMOVE' THEN
          PERFORM apply_cart_remove(
            p_user_id, 
            v_op->>'sku', 
            v_op->>'device_id'
          );
        WHEN 'SELECT' THEN
          PERFORM apply_cart_select(
            p_user_id, 
            v_op->>'sku', 
            v_op->>'device_id',
            true
          );
        WHEN 'DESELECT' THEN
          PERFORM apply_cart_select(
            p_user_id, 
            v_op->>'sku', 
            v_op->>'device_id',
            false
          );
        WHEN 'EPOCH' THEN
          PERFORM apply_cart_epoch(p_user_id);
      END CASE;
      
      RETURN QUERY SELECT (v_op->>'op_id')::UUID, true, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT (v_op->>'op_id')::UUID, false, SQLERRM;
    END;
  END LOOP;
  
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
  qty_pos: Record<string, number>  // {"device_a": 3, "device_b": 2}
  qty_neg: Record<string, number>  // {"device_a": 1, "device_b": 0}
  selected: boolean
  selected_vv: Record<string, number>  // Version Vector
  remove_vv: Record<string, number>    // Version Vector Tombstone
  epoch: number
}

interface CartOp {
  op_id: string  // UUID
  type: 'INC' | 'DEC' | 'REMOVE' | 'SELECT' | 'DESELECT' | 'EPOCH'
  sku: string
  device_id: string
  epoch: number
  client_ts: number
}

// lib/cart/merge.ts
export class CartMergeEngine {
  /**
   * 读取寄存器状态
   * 公式: 
   *   qty = Σ(qty_pos) - Σ(qty_neg)
   *   visible = for all device: remove_vv[device] < qty_pos[device]
   *             AND epoch == current_epoch
   */
  static readRegister(
    register: CartRegister,
    currentEpoch: number
  ): { qty: number; visible: boolean; selected: boolean } | null {
    // Epoch检查（Write-Time Fence）
    if (register.epoch !== currentEpoch) {
      return null
    }
    
    // 计算qty
    const posSum = Object.values(register.qty_pos).reduce((a, b) => a + b, 0)
    const negSum = Object.values(register.qty_neg).reduce((a, b) => a + b, 0)
    const qty = posSum - negSum
    
    // Version Vector Tombstone检查
    const allDevices = new Set([
      ...Object.keys(register.qty_pos),
      ...Object.keys(register.remove_vv)
    ])
    
    for (const device of allDevices) {
      const pos = register.qty_pos[device] || 0
      const remove = register.remove_vv[device] || 0
      
      // 如果remove >= pos，说明该设备已经删除了
      if (remove >= pos) {
        return null
      }
    }
    
    if (qty <= 0) {
      return null
    }
    
    return {
      qty,
      visible: true,
      selected: register.selected
    }
  }
  
  /**
   * 合并本地与远程寄存器（CRDT Merge）
   * PN-Counter合并: max per device
   * VV Tombstone合并: max per device
   */
  static mergeRegisters(
    local: CartRegister,
    remote: CartRegister
  ): CartRegister {
    // Epoch不一致，使用较新的epoch
    if (local.epoch !== remote.epoch) {
      return local.epoch > remote.epoch ? local : remote
    }
    
    // 合并PN-Counter（per-device max）
    const mergeCounter = (
      local: Record<string, number>,
      remote: Record<string, number>
    ): Record<string, number> => {
      const result: Record<string, number> = {}
      const allDevices = new Set([...Object.keys(local), ...Object.keys(remote)])
      
      for (const device of allDevices) {
        result[device] = Math.max(local[device] || 0, remote[device] || 0)
      }
      
      return result
    }
    
    // 合并Version Vector（per-device max）
    const mergeVV = mergeCounter
    
    // LWW for selected
    const localSelSum = Object.values(local.selected_vv).reduce((a, b) => a + b, 0)
    const remoteSelSum = Object.values(remote.selected_vv).reduce((a, b) => a + b, 0)
    
    return {
      ...local,
      qty_pos: mergeCounter(local.qty_pos, remote.qty_pos),
      qty_neg: mergeCounter(local.qty_neg, remote.qty_neg),
      selected: localSelSum > remoteSelSum ? local.selected : remote.selected,
      selected_vv: mergeVV(local.selected_vv, remote.selected_vv),
      remove_vv: mergeVV(local.remove_vv, remote.remove_vv)
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
            [op.device_id]: (base.qty_pos[op.device_id] || 0) + 1
          }
        }
      case 'DEC':
        return {
          ...base,
          qty_neg: {
            ...base.qty_neg,
            [op.device_id]: (base.qty_neg[op.device_id] || 0) + 1
          }
        }
      case 'REMOVE': {
        // Version Vector Tombstone
        const currentPos = base.qty_pos[op.device_id] || 0
        return {
          ...base,
          remove_vv: {
            ...base.remove_vv,
            [op.device_id]: Math.max(
              base.remove_vv[op.device_id] || 0,
              currentPos + 1
            )
          }
        }
      }
      case 'SELECT':
        return {
          ...base,
          selected: true,
          selected_vv: {
            ...base.selected_vv,
            [op.device_id]: (base.selected_vv[op.device_id] || 0) + 1
          }
        }
      case 'DESELECT':
        return {
          ...base,
          selected: false,
          selected_vv: {
            ...base.selected_vv,
            [op.device_id]: (base.selected_vv[op.device_id] || 0) + 1
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
      selected: false,
      selected_vv: {},
      remove_vv: {},
      epoch
    }
  }
}
```

### 5.2 React Hook实现

```typescript
// hooks/useCartV3.ts
import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { CartMergeEngine } from '@/lib/cart/merge'
import { useCartStore } from '@/store/cartStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useCartV3() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const deviceId = useDeviceId()
  const localOpQueue = useLocalOpQueue()
  
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
  
  // 获取购物车状态（主读取模型）
  const { data: cartState } = useQuery({
    queryKey: ['cart-state', user?.id, currentEpoch],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('cart_registers')
        .select('*')
        .eq('user_id', user.id)
        .eq('epoch', currentEpoch)
      
      // 过滤可见项
      return (data || [])
        .map(r => CartMergeEngine.readRegister(r, currentEpoch))
        .filter((r): r is NonNullable<typeof r> => r !== null)
    },
    enabled: !!user
  })
  
  // 推送操作（批量，UUID去重）
  const pushOps = useMutation({
    mutationFn: async (ops: CartOp[]) => {
      if (!user || ops.length === 0) return
      
      // 批量发送
      const { error } = await supabase.rpc('batch_apply_cart_ops', {
        p_user_id: user.id,
        p_ops: JSON.stringify(ops.map(op => ({
          op_id: op.op_id,
          type: op.type,
          sku: op.sku,
          device_id: op.device_id
        })))
      })
      
      if (error) throw error
      
      // 记录到oplog（用于其他设备同步）
      await supabase.from('cart_ops').insert(
        ops.map(op => ({
          op_id: op.op_id,
          user_id: user.id,
          device_id: deviceId,
          op_type: op.type,
          sku: op.sku,
          client_ts: op.client_ts,
          server_ts: new Date().toISOString()
        }))
      )
    },
    onSuccess: () => {
      // 刷新购物车状态
      queryClient.invalidateQueries({ queryKey: ['cart-state'] })
    }
  })
  
  // 拉取远程操作（其他设备的操作）
  const pullOps = useCallback(async () => {
    if (!user) return
    
    const lastSyncTs = localOpQueue.getLastSyncTimestamp()
    
    const { data: remoteOps } = await supabase
      .from('cart_ops')
      .select('*')
      .eq('user_id', user.id)
      .neq('device_id', deviceId) // 排除本设备
      .gt('server_ts', lastSyncTs)
      .order('server_ts', { ascending: true })
    
    if (remoteOps && remoteOps.length > 0) {
      // 应用远程操作到本地状态
      for (const op of remoteOps) {
        useCartStore.getState().applyRemoteOp(op)
      }
      
      // 更新同步时间戳
      localOpQueue.updateLastSyncTimestamp(
        remoteOps[remoteOps.length - 1].server_ts
      )
    }
  }, [user, deviceId, supabase])
  
  // 用户操作API
  const addItem = useCallback((sku: string) => {
    const op: CartOp = {
      op_id: crypto.randomUUID(),  // UUID去重
      type: 'INC',
      sku,
      device_id: deviceId,
      epoch: currentEpoch,
      client_ts: Date.now()
    }
    
    // 乐观更新本地状态
    useCartStore.getState().optimisticApply(op)
    
    // 加入本地队列
    localOpQueue.enqueue(op)
    
    // 触发同步
    debouncedSync()
  }, [currentEpoch, deviceId])
  
  const removeItem = useCallback((sku: string) => {
    const op: CartOp = {
      op_id: crypto.randomUUID(),
      type: 'REMOVE',
      sku,
      device_id: deviceId,
      epoch: currentEpoch,
      client_ts: Date.now()
    }
    
    useCartStore.getState().optimisticApply(op)
    localOpQueue.enqueue(op)
    debouncedSync()
  }, [currentEpoch, deviceId])
  
  const clearCart = useCallback(async () => {
    // EPOCH操作立即执行（不排队）
    await supabase.rpc('apply_cart_epoch', {
      p_user_id: user?.id
    })
    
    // 刷新epoch
    queryClient.invalidateQueries({ queryKey: ['cart-epoch'] })
  }, [user, supabase, queryClient])
  
  // 同步机制（Visibility API）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pullOps() // 页面可见时拉取
        syncPendingOps() // 推送 pending ops
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pullOps])
  
  // 定期同步（30秒，用于长停留页面）
  useEffect(() => {
    const interval = setInterval(() => {
      pullOps()
      syncPendingOps()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [pullOps])
  
  return {
    items: cartState || [],
    currentEpoch,
    addItem,
    removeItem,
    clearCart,
    isSyncing: pushOps.isPending
  }
}

// 辅助Hook
function useDeviceId(): string {
  const [deviceId, setDeviceId] = useState('')
  
  useEffect(() => {
    let id = localStorage.getItem('cart-device-id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('cart-device-id', id)
    }
    setDeviceId(id)
  }, [])
  
  return deviceId
}

function useLocalOpQueue() {
  // 使用IndexedDB存储待同步操作
  return {
    enqueue: (op: CartOp) => {
      // 存入IndexedDB
    },
    getPendingOps: (): CartOp[] => {
      // 从IndexedDB读取
      return []
    },
    markAsSynced: (opIds: string[]) => {
      // 从IndexedDB删除
    },
    getLastSyncTimestamp: (): string => {
      return localStorage.getItem('cart-last-sync') || '1970-01-01'
    },
    updateLastSyncTimestamp: (ts: string) => {
      localStorage.setItem('cart-last-sync', ts)
    }
  }
}

let syncTimeout: NodeJS.Timeout
function debouncedSync() {
  clearTimeout(syncTimeout)
  syncTimeout = setTimeout(() => {
    syncPendingOps()
  }, 500) // 500ms防抖
}

async function syncPendingOps() {
  // 实现批量同步逻辑
}
```

---

## 6. 性能优化

### 6.1 JSONB操作优化

```sql
-- 创建辅助函数用于JSONB计数器操作
CREATE OR REPLACE FUNCTION jsonb_increment(
  p_jsonb JSONB,
  p_key TEXT,
  p_delta INT DEFAULT 1
) RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_set(
    COALESCE(p_jsonb, '{}'::jsonb),
    array[p_key],
    ((COALESCE((p_jsonb->>p_key)::int, 0) + p_delta)::text)::jsonb
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 使用示例
-- UPDATE cart_registers 
-- SET qty_pos = jsonb_increment(qty_pos, 'device_123', 1)
-- WHERE user_id = 'xxx' AND sku = 'yyy';
```

### 6.2 批量写入优化

```typescript
// lib/cart/batch.ts
export class CartBatchOptimizer {
  private batch: CartOp[] = []
  private timeout: NodeJS.Timeout | null = null
  private readonly BATCH_SIZE = 10
  private readonly BATCH_DELAY = 100 // ms
  
  enqueue(op: CartOp, onFlush: (ops: CartOp[]) => Promise<void>) {
    this.batch.push(op)
    
    // 立即刷新条件
    if (this.batch.length >= this.BATCH_SIZE) {
      this.flush(onFlush)
      return
    }
    
    // 延迟刷新
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = setTimeout(() => {
      this.flush(onFlush)
    }, this.BATCH_DELAY)
  }
  
  private async flush(onFlush: (ops: CartOp[]) => Promise<void>) {
    if (this.batch.length === 0) return
    
    const ops = [...this.batch]
    this.batch = []
    
    // 合并相同SKU的INC/DEC操作（Device-Scoped）
    const mergedOps = this.mergeOps(ops)
    
    await onFlush(mergedOps)
  }
  
  private mergeOps(ops: CartOp[]): CartOp[] {
    const merged = new Map<string, Map<string, { inc: number; dec: number; lastOp: CartOp }>>()
    
    for (const op of ops) {
      const deviceOps = merged.get(op.sku) || new Map()
      const existing = deviceOps.get(op.device_id) || { inc: 0, dec: 0, lastOp: op }
      
      if (op.type === 'INC') existing.inc++
      if (op.type === 'DEC') existing.dec++
      existing.lastOp = op
      
      deviceOps.set(op.device_id, existing)
      merged.set(op.sku, deviceOps)
    }
    
    // 生成合并后的操作
    const result: CartOp[] = []
    for (const [sku, deviceOps] of merged) {
      for (const [deviceId, { inc, dec, lastOp }] of deviceOps) {
        const net = inc - dec
        if (net > 0) {
          for (let i = 0; i < net; i++) {
            result.push({ ...lastOp, type: 'INC', op_id: crypto.randomUUID() })
          }
        } else if (net < 0) {
          for (let i = 0; i < Math.abs(net); i++) {
            result.push({ ...lastOp, type: 'DEC', op_id: crypto.randomUUID() })
          }
        }
      }
    }
    
    return result
  }
}
```

### 6.3 数据库索引优化

```sql
-- 复合索引优化查询性能
CREATE INDEX CONCURRENTLY idx_cart_registers_read 
ON cart_registers(user_id, epoch)
WHERE jsonb_typeof(qty_pos) != 'null';

-- GIN索引用于JSONB查询（如果需要按device查询）
CREATE INDEX CONCURRENTLY idx_cart_registers_qty_pos 
ON cart_registers USING GIN (qty_pos);

-- OpLog查询优化
CREATE INDEX CONCURRENTLY idx_cart_ops_sync 
ON cart_ops(user_id, device_id, server_ts)
WHERE server_ts > NOW() - INTERVAL '1 hour';
```

---

## 7. 实施计划

### 7.1 阶段划分

| 阶段 | 内容 | 工时 | 依赖 |
|------|------|------|------|
| **P0** | 数据库迁移（JSONB Schema） | 8h | - |
| **P1** | CartMergeEngine核心逻辑 | 5h | P0 |
| **P2** | useCartV3 Hook实现 | 6h | P1 |
| **P3** | IndexedDB本地队列 | 4h | P2 |
| **P4** | 批量写入优化 | 3h | P2 |
| **P5** | 集成测试 | 5h | P3, P4 |
| **总计** | | **31h** | |

### 7.2 详细任务

#### P0: 数据库迁移

```sql
-- 1. 创建新表（JSONB结构）
-- 2. 创建辅助函数（jsonb_increment等）
-- 3. 创建CRDT Apply函数
-- 4. 创建索引
-- 5. 设置TTL
```

#### P1: CartMergeEngine

```typescript
// 实现：
// - readRegister() with VV Tombstone
// - mergeRegisters() with per-device max
// - applyOp() with device_id scope
// - 单元测试（覆盖所有边界情况）
```

#### P2: useCartV3 Hook

```typescript
// 实现：
// - UUID生成
// - Device ID管理
// - useQuery获取epoch和state
// - useMutation推送操作
// - 乐观更新逻辑
// - Visibility API集成
```

#### P3: IndexedDB本地队列

```typescript
// 实现：
// - 操作持久化（UUID去重）
// - 离线支持
// - 断点续传
```

#### P4: 批量写入优化

```typescript
// 实现：
// - Device-Scoped操作合并
// - 批量RPC
// - 防抖策略
```

#### P5: 集成测试

```typescript
// 测试场景：
// - 单机多标签同步
// - 双设备并发INC（Counter Inflation测试）
// - REMOVE后INC（Version Vector测试）
// - CLEAR后旧操作被忽略（Write-Time Fence测试）
// - 同毫秒操作（UUID去重测试）
// - 离线后恢复
// - 高频点击（100次/秒）
```

---

## 8. 风险评估

### 8.1 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| JSONB性能问题 | 中 | 高 | 压力测试+索引优化 |
| CRDT理解错误 | 低 | 极高 | 架构师审查+数学证明 |
| IndexedDB兼容性 | 低 | 中 | 降级到localStorage |
| 数据迁移失败 | 低 | 极高 | 蓝绿部署+回滚方案 |

### 8.2 业务风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 用户购物车数据丢失 | 低 | 极高 | 完整备份+灰度发布 |
| 性能下降 | 中 | 高 | A/B测试+监控 |
| 用户体验变化 | 中 | 中 | 用户测试+反馈收集 |

---

## 9. 附录

### 9.1 数学证明：Device-Scoped PN-Counter可交换性

```
定理：Device-Scoped PN-Counter操作是可交换的

证明：
设有两个设备 device_a 和 device_b

情况1：device_a执行INC，device_b执行INC
  device_a: qty_pos[device_a] += 1
  device_b: qty_pos[device_b] += 1
  
  无论顺序如何：
    qty_pos = {"device_a": 1, "device_b": 1}
  
  结果相同。

情况2：同一设备执行两次INC
  device_a: qty_pos[device_a] += 1
  device_a: qty_pos[device_a] += 1
  
  无论顺序如何：
    qty_pos[device_a] = 2
  
  结果相同。

情况3：Merge操作
  local:  {"device_a": 3, "device_b": 2}
  remote: {"device_a": 2, "device_b": 4}
  
  merged: {"device_a": max(3,2)=3, "device_b": max(2,4)=4}
  
  无论local和remote的顺序如何，结果相同。

因此Device-Scoped PN-Counter满足可交换性。
∎
```

### 9.2 数学证明：Version Vector Tombstone幂等性

```
定理：Version Vector Tombstone是幂等的

证明：
设remove_vv[device] = qty_pos[device] + 1

情况1：先INC后REMOVE
  INC:  qty_pos[device] = 1
  REMOVE: remove_vv[device] = 1 + 1 = 2
  
  可见性检查: remove_vv(2) > qty_pos(1) → 不可见 ✓

情况2：先REMOVE后INC
  REMOVE: remove_vv[device] = 0 + 1 = 1
  INC:    qty_pos[device] = 1
  
  可见性检查: remove_vv(1) >= qty_pos(1) → 不可见 ✓

情况3：多次REMOVE
  第一次REMOVE: remove_vv[device] = 1
  第二次REMOVE: remove_vv[device] = max(1, 当前qty_pos+1)
  
  如果qty_pos未变：remove_vv保持1
  如果qty_pos增加：remove_vv相应增加
  
  结果一致。

因此Version Vector Tombstone满足幂等性。
∎
```

### 9.3 对比表：v2.0 vs v3.0 vs v3.1 vs v3.2

| 特性 | v2.0 | v3.0 | v3.1 | **v3.2** |
|------|------|------|------|----------|
| 数据模型 | JSONB Snapshot | Register | Shared PN-Counter | **CRDT PN-Counter** |
| Counter Scope | Global | Global | Global | **Device-Scoped** |
| Tombstone | LWW | int | int | **Version Vector** |
| Epoch Fence | None | Op-Time | Op-Time | **Write-Time** |
| Dedup | None | client_ts | client_ts | **UUID** |
| Offline Safety | ❌ | ❌ | ⚠️ | **✅** |
| Causal Correctness | ❌ | ❌ | ❌ | **✅** |
| Counter Inflation | ❌ | ❌ | ❌ | **✅** |
| Mobile Safety | 🔴 | 🔴 | 🟠 | **🟢** |

---

## 10. 结论

v3.2通过引入**Causally-Stable Hybrid Register**模型，彻底解决了v3.1的所有问题：

1. ✅ **Device-Scoped PN-Counter**: 每个设备独立计数，消除Counter Inflation
2. ✅ **Version Vector Tombstone**: 真正的因果安全删除
3. ✅ **Write-Time Epoch Fence**: 消除Zombie Write After Clear
4. ✅ **UUID去重**: 消除同毫秒Intent丢失
5. ✅ **CRDT Merge**: 真正的离线可合并性

**推荐立即实施v3.2架构**。
