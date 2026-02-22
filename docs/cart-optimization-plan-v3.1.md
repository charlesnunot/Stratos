# Cart Optimization Plan v3.1 - PN-Counter Hybrid Register

## 文档信息
- **版本**: v3.1
- **状态**: 架构级设计（待总架构师审查）
- **更新日期**: 2026-02-14
- **核心改进**: PN-Counter Hybrid Register（解决v3.0的OCC问题）

---

## 1. v3.0 问题总结

### 1.1 核心架构缺陷

| 问题ID | 问题描述 | 严重程度 | 影响 |
|--------|----------|----------|------|
| P0-A | SWOR (Single-Writer Optimistic Register) | 🔴 Critical | 离线设备冲突 → Intent丢失 |
| P0-B | INC不是幺半群（需要revision匹配） | 🔴 Critical | `INC(a)∘INC(b) ≠ INC(b)∘INC(a)` |
| P0-C | REMOVE Tombstone不安全 | 🔴 Critical | `INC+REMOVE`顺序不同结果不同 |
| P1-D | `FOR UPDATE` = 吞吐瓶颈 | 🟠 High | 高频点击 → 7/8冲突 |
| P1-E | Epoch缺少Write Fence | 🟠 High | CLEAR后Zombie Resurrection |

### 1.2 真实场景故障

```
场景：用户飞机模式下点击+1两次（iPhone + Android）

iPhone:     INC A +1 (rev=0→1)
Android:    INC A +1 (rev=0→1)
            ↓
服务器（v3.0 OCC）:
  iPhone先到: rev=0→1 ✓
  Android后到: rev=0 != 1 → ❌ CONFLICT
            ↓
Android客户端逻辑: 服务器值覆盖本地
            ↓
最终结果: qty = 1（用户点击2次，只生效1次）

🟥 Revenue-Impacting Bug（Shopify/Amazon/TikTok标准）
```

---

## 2. v3.1 正确模型：PN-Counter Hybrid Register

### 2.1 核心思想

```
┌─────────────────────────────────────────────────────────────┐
│              PN-Counter Hybrid Register                      │
├─────────────────────────────────────────────────────────────┤
│  qty_pos          │ G-Counter（只增不减）                   │
│  qty_neg          │ G-Counter（只增不减）                   │
│  qty_revision     │ 版本号（用于可见性判断）                 │
├─────────────────────────────────────────────────────────────┤
│  selected         │ LWW-Register（最后写入获胜）            │
│  selected_revision│ 版本号                                  │
├─────────────────────────────────────────────────────────────┤
│  remove_revision  │ Tombstone版本（幂等删除）               │
│  epoch            │ 当前epoch（Write Fence）                │
└─────────────────────────────────────────────────────────────┘

读取公式:
  qty = qty_pos - qty_neg
  visible = qty > 0 
            AND remove_revision < qty_revision
            AND epoch == current_epoch
```

### 2.2 为什么这是正确的

| 特性 | v3.0 (OCC) | v3.1 (PN-Counter) |
|------|-----------|-------------------|
| 离线Merge | ❌ 冲突丢失 | ✅ 自动合并 |
| INC可交换 | ❌ 需要revision匹配 | ✅ pos/neg独立累加 |
| REMOVE幂等 | ❌ 顺序敏感 | ✅ revision比较 |
| 并发写入 | ❌ FOR UPDATE串行 | ✅ 无锁原子更新 |
| 高频点击 | ❌ 大量冲突 | ✅ 全部成功 |
| CLEAR安全 | ❌ Zombie可能 | ✅ Write Fence保护 |

---

## 3. 数据库Schema设计

### 3.1 cart_registers（主读取模型）

```sql
-- 购物车寄存器表（PN-Counter Hybrid Register）
CREATE TABLE cart_registers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sku TEXT NOT NULL, -- 格式: product_id-color-size
  
  -- PN-Counter for quantity (可交换)
  qty_pos INT NOT NULL DEFAULT 0,        -- 正计数器
  qty_neg INT NOT NULL DEFAULT 0,        -- 负计数器
  qty_revision INT NOT NULL DEFAULT 0,   -- 版本号
  
  -- LWW-Register for selection
  selected BOOLEAN NOT NULL DEFAULT false,
  selected_revision INT NOT NULL DEFAULT 0,
  
  -- Tombstone for removal（幂等）
  remove_revision INT NOT NULL DEFAULT -1, -- -1表示未删除
  
  -- Epoch Fence
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
COMMENT ON TABLE cart_registers IS '购物车主读取模型 - PN-Counter Hybrid Register';
COMMENT ON COLUMN cart_registers.qty_pos IS '正计数器（G-Counter）';
COMMENT ON COLUMN cart_registers.qty_neg IS '负计数器（G-Counter）';
COMMENT ON COLUMN cart_registers.remove_revision IS '删除墓碑版本号（-1表示未删除）';
COMMENT ON COLUMN cart_registers.epoch IS '当前epoch（Write Fence）';
```

### 3.2 cart_ops（操作日志）

```sql
-- 购物车操作日志（用于同步，7天TTL）
CREATE TABLE cart_ops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  
  -- 操作类型
  op_type TEXT NOT NULL CHECK (op_type IN (
    'INC',      -- 增加数量
    'DEC',      -- 减少数量
    'REMOVE',   -- 删除（Tombstone）
    'SELECT',   -- 选中
    'DESELECT', -- 取消选中
    'EPOCH'     -- 清空购物车（epoch++）
  )),
  
  sku TEXT NOT NULL,
  
  -- 操作参数（可选）
  op_value INT, -- 用于SET操作（如果未来需要）
  
  -- 时间戳
  client_ts BIGINT NOT NULL, -- 客户端时间戳（用于去重）
  server_ts TIMESTAMPTZ DEFAULT NOW(),
  
  -- 设备信息
  user_agent TEXT,
  
  UNIQUE(user_id, device_id, client_ts)
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

COMMENT ON TABLE cart_ops IS '购物车操作日志 - 仅用于同步，7天自动清理';
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

### 4.1 核心原则

```
🎯 关键洞察：PostgreSQL UPDATE 是原子的

不需要 FOR UPDATE，因为：
  UPDATE cart_registers SET qty_pos = qty_pos + 1
  在数据库层面已经是原子操作

多个并发UPDATE会：
  1. 串行执行（行锁自动获取）
  2. 每个都成功
  3. 最终qty_pos = 初始值 + 并发数
```

### 4.2 Apply函数实现

```sql
-- 应用INC操作（无锁）
CREATE OR REPLACE FUNCTION apply_cart_inc(
  p_user_id UUID,
  p_sku TEXT,
  p_current_epoch INT
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
BEGIN
  -- 获取当前epoch
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  -- 如果epoch不匹配，说明CLEAR已经发生，忽略此操作
  IF v_current_epoch IS NULL OR v_current_epoch != p_current_epoch THEN
    RETURN; -- 静默忽略（操作来自旧epoch）
  END IF;
  
  -- 无锁原子更新（利用PostgreSQL行级原子性）
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, qty_revision,
    selected, selected_revision, remove_revision, epoch
  ) VALUES (
    p_user_id, p_sku, 1, 0, 1,
    false, 0, -1, p_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    qty_pos = cart_registers.qty_pos + 1,
    qty_revision = cart_registers.qty_revision + 1,
    epoch = p_current_epoch,  -- Write Fence!
    updated_at = NOW()
  WHERE cart_registers.epoch = p_current_epoch;  -- 双重检查
  
END;
$$ LANGUAGE plpgsql;

-- 应用DEC操作（无锁）
CREATE OR REPLACE FUNCTION apply_cart_dec(
  p_user_id UUID,
  p_sku TEXT,
  p_current_epoch INT
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL OR v_current_epoch != p_current_epoch THEN
    RETURN;
  END IF;
  
  -- 无锁原子更新
  UPDATE cart_registers
  SET 
    qty_neg = qty_neg + 1,
    qty_revision = qty_revision + 1,
    epoch = p_current_epoch,
    updated_at = NOW()
  WHERE user_id = p_user_id 
    AND sku = p_sku
    AND epoch = p_current_epoch;
  
END;
$$ LANGUAGE plpgsql;

-- 应用REMOVE操作（幂等Tombstone）
CREATE OR REPLACE FUNCTION apply_cart_remove(
  p_user_id UUID,
  p_sku TEXT,
  p_current_epoch INT
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
  v_qty_revision INT;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL OR v_current_epoch != p_current_epoch THEN
    RETURN;
  END IF;
  
  -- 获取当前qty_revision
  SELECT qty_revision INTO v_qty_revision
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku;
  
  -- 设置remove_revision = qty_revision + 1（幂等）
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, qty_revision,
    selected, selected_revision, remove_revision, epoch
  ) VALUES (
    p_user_id, p_sku, 0, 0, 0,
    false, 0, 1, p_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    remove_revision = CASE 
      WHEN cart_registers.qty_revision >= 0 
      THEN cart_registers.qty_revision + 1 
      ELSE 1 
    END,
    epoch = p_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = p_current_epoch;
  
END;
$$ LANGUAGE plpgsql;

-- 应用SELECT/DESELECT操作（LWW）
CREATE OR REPLACE FUNCTION apply_cart_select(
  p_user_id UUID,
  p_sku TEXT,
  p_selected BOOLEAN,
  p_current_epoch INT
) RETURNS VOID AS $$
DECLARE
  v_current_epoch INT;
BEGIN
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL OR v_current_epoch != p_current_epoch THEN
    RETURN;
  END IF;
  
  INSERT INTO cart_registers (
    user_id, sku, qty_pos, qty_neg, qty_revision,
    selected, selected_revision, remove_revision, epoch
  ) VALUES (
    p_user_id, p_sku, 0, 0, 0,
    p_selected, 1, -1, p_current_epoch
  )
  ON CONFLICT (user_id, sku) DO UPDATE SET
    selected = p_selected,
    selected_revision = cart_registers.selected_revision + 1,
    epoch = p_current_epoch,
    updated_at = NOW()
  WHERE cart_registers.epoch = p_current_epoch;
  
END;
$$ LANGUAGE plpgsql;

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
  
  -- 可选：软删除旧epoch的寄存器（或保留用于审计）
  -- DELETE FROM cart_registers WHERE user_id = p_user_id AND epoch < v_new_epoch;
  
  RETURN v_new_epoch;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 批量Apply（性能优化）

```sql
-- 批量应用操作（减少RTT）
CREATE OR REPLACE FUNCTION batch_apply_cart_ops(
  p_user_id UUID,
  p_ops JSONB  -- [{"type": "INC", "sku": "...", "epoch": 7}, ...]
) RETURNS TABLE(
  sku TEXT,
  success BOOLEAN,
  error TEXT
) AS $$
DECLARE
  v_op JSONB;
  v_current_epoch INT;
BEGIN
  -- 获取当前epoch（一次查询）
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- 遍历操作
  FOR v_op IN SELECT * FROM jsonb_array_elements(p_ops)
  LOOP
    BEGIN
      CASE v_op->>'type'
        WHEN 'INC' THEN
          PERFORM apply_cart_inc(p_user_id, v_op->>'sku', (v_op->>'epoch')::INT);
        WHEN 'DEC' THEN
          PERFORM apply_cart_dec(p_user_id, v_op->>'sku', (v_op->>'epoch')::INT);
        WHEN 'REMOVE' THEN
          PERFORM apply_cart_remove(p_user_id, v_op->>'sku', (v_op->>'epoch')::INT);
        WHEN 'SELECT' THEN
          PERFORM apply_cart_select(p_user_id, v_op->>'sku', true, (v_op->>'epoch')::INT);
        WHEN 'DESELECT' THEN
          PERFORM apply_cart_select(p_user_id, v_op->>'sku', false, (v_op->>'epoch')::INT);
        WHEN 'EPOCH' THEN
          PERFORM apply_cart_epoch(p_user_id);
      END CASE;
      
      RETURN QUERY SELECT v_op->>'sku', true, NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_op->>'sku', false, SQLERRM;
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
  qty_pos: number
  qty_neg: number
  qty_revision: number
  selected: boolean
  selected_revision: number
  remove_revision: number
  epoch: number
}

interface CartOp {
  id: string
  type: 'INC' | 'DEC' | 'REMOVE' | 'SELECT' | 'DESELECT' | 'EPOCH'
  sku: string
  epoch: number
  client_ts: number
}

// lib/cart/merge.ts
export class CartMergeEngine {
  /**
   * 读取寄存器状态
   * 公式: qty = qty_pos - qty_neg
   *       visible = qty > 0 
   *                 && remove_revision < qty_revision
   *                 && epoch == current_epoch
   */
  static readRegister(
    register: CartRegister,
    currentEpoch: number
  ): { qty: number; visible: boolean; selected: boolean } | null {
    // Epoch检查（Write Fence）
    if (register.epoch !== currentEpoch) {
      return null // 旧epoch的数据不可见
    }
    
    const qty = register.qty_pos - register.qty_neg
    
    // Tombstone检查（幂等删除）
    const isRemoved = register.remove_revision >= 0 
      && register.remove_revision >= register.qty_revision
    
    if (isRemoved || qty <= 0) {
      return null // 已删除或数量为0
    }
    
    return {
      qty,
      visible: true,
      selected: register.selected
    }
  }
  
  /**
   * 合并本地操作与远程状态
   * 关键：PN-Counter可以简单相加合并
   */
  static mergeRegisters(
    local: CartRegister,
    remote: CartRegister,
    currentEpoch: number
  ): CartRegister {
    // Epoch不一致，使用较新的epoch
    if (local.epoch !== remote.epoch) {
      return local.epoch > remote.epoch ? local : remote
    }
    
    // 同epoch，合并PN-Counter（可交换！）
    return {
      ...local,
      qty_pos: Math.max(local.qty_pos, remote.qty_pos), // G-Counter合并 = max
      qty_neg: Math.max(local.qty_neg, remote.qty_neg), // G-Counter合并 = max
      qty_revision: Math.max(local.qty_revision, remote.qty_revision),
      selected: local.selected_revision > remote.selected_revision 
        ? local.selected 
        : remote.selected, // LWW
      selected_revision: Math.max(local.selected_revision, remote.selected_revision),
      remove_revision: Math.max(local.remove_revision, remote.remove_revision)
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
          qty_pos: base.qty_pos + 1,
          qty_revision: base.qty_revision + 1,
          epoch: currentEpoch
        }
      case 'DEC':
        return {
          ...base,
          qty_neg: base.qty_neg + 1,
          qty_revision: base.qty_revision + 1,
          epoch: currentEpoch
        }
      case 'REMOVE':
        return {
          ...base,
          remove_revision: base.qty_revision + 1,
          epoch: currentEpoch
        }
      case 'SELECT':
        return {
          ...base,
          selected: true,
          selected_revision: base.selected_revision + 1,
          epoch: currentEpoch
        }
      case 'DESELECT':
        return {
          ...base,
          selected: false,
          selected_revision: base.selected_revision + 1,
          epoch: currentEpoch
        }
      default:
        return base
    }
  }
  
  private static createEmptyRegister(sku: string, epoch: number): CartRegister {
    return {
      sku,
      qty_pos: 0,
      qty_neg: 0,
      qty_revision: 0,
      selected: false,
      selected_revision: 0,
      remove_revision: -1,
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
  
  // 推送操作（批量）
  const pushOps = useMutation({
    mutationFn: async (ops: CartOp[]) => {
      if (!user || ops.length === 0) return
      
      // 批量发送
      const { error } = await supabase.rpc('batch_apply_cart_ops', {
        p_user_id: user.id,
        p_ops: JSON.stringify(ops.map(op => ({
          type: op.type,
          sku: op.sku,
          epoch: op.epoch
        })))
      })
      
      if (error) throw error
      
      // 记录到oplog（用于其他设备同步）
      await supabase.from('cart_ops').insert(
        ops.map(op => ({
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
      id: generateOpId(),
      type: 'INC',
      sku,
      epoch: currentEpoch,
      client_ts: Date.now()
    }
    
    // 乐观更新本地状态
    useCartStore.getState().optimisticApply(op)
    
    // 加入本地队列
    localOpQueue.enqueue(op)
    
    // 触发同步
    debouncedSync()
  }, [currentEpoch])
  
  const removeItem = useCallback((sku: string) => {
    const op: CartOp = {
      id: generateOpId(),
      type: 'REMOVE',
      sku,
      epoch: currentEpoch,
      client_ts: Date.now()
    }
    
    useCartStore.getState().optimisticApply(op)
    localOpQueue.enqueue(op)
    debouncedSync()
  }, [currentEpoch])
  
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

function generateOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
```

---

## 6. 性能优化

### 6.1 批量写入优化

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
    
    // 合并相同SKU的INC/DEC操作
    const mergedOps = this.mergeOps(ops)
    
    await onFlush(mergedOps)
  }
  
  private mergeOps(ops: CartOp[]): CartOp[] {
    const merged = new Map<string, { inc: number; dec: number; lastOp: CartOp }>()
    
    for (const op of ops) {
      const key = `${op.sku}-${op.epoch}`
      const existing = merged.get(key) || { inc: 0, dec: 0, lastOp: op }
      
      if (op.type === 'INC') existing.inc++
      if (op.type === 'DEC') existing.dec++
      existing.lastOp = op
      
      merged.set(key, existing)
    }
    
    // 生成合并后的操作
    const result: CartOp[] = []
    for (const [key, { inc, dec, lastOp }] of merged) {
      // 净增量
      const net = inc - dec
      if (net > 0) {
        for (let i = 0; i < net; i++) {
          result.push({ ...lastOp, type: 'INC', id: generateOpId() })
        }
      } else if (net < 0) {
        for (let i = 0; i < Math.abs(net); i++) {
          result.push({ ...lastOp, type: 'DEC', id: generateOpId() })
        }
      }
    }
    
    return result
  }
}
```

### 6.2 数据库索引优化

```sql
-- 复合索引优化查询性能
CREATE INDEX CONCURRENTLY idx_cart_registers_read 
ON cart_registers(user_id, epoch, remove_revision, qty_revision)
WHERE qty_pos > qty_neg;  -- 部分索引，只包含有数量的项

-- OpLog查询优化
CREATE INDEX CONCURRENTLY idx_cart_ops_sync 
ON cart_ops(user_id, device_id, server_ts)
WHERE server_ts > NOW() - INTERVAL '1 hour';  -- 热数据索引
```

### 6.3 缓存策略

```typescript
// lib/cart/cache.ts
import { QueryClient } from '@tanstack/react-query'

export const cartQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30秒内视为新鲜
      cacheTime: 5 * 60 * 1000, // 5分钟缓存
      refetchOnWindowFocus: false, // 使用Visibility API替代
    }
  }
})

// 乐观更新策略
export function optimisticCartUpdate(
  queryClient: QueryClient,
  userId: string,
  updater: (old: CartItem[]) => CartItem[]
) {
  const queryKey = ['cart-state', userId]
  
  // 保存之前的状态用于回滚
  const previousState = queryClient.getQueryData(queryKey)
  
  // 乐观更新
  queryClient.setQueryData(queryKey, updater)
  
  return {
    rollback: () => {
      queryClient.setQueryData(queryKey, previousState)
    }
  }
}
```

---

## 7. 实施计划

### 7.1 阶段划分

| 阶段 | 内容 | 工时 | 依赖 |
|------|------|------|------|
| **P0** | 数据库迁移（3表+函数） | 6h | - |
| **P1** | CartMergeEngine核心逻辑 | 4h | P0 |
| **P2** | useCartV3 Hook实现 | 5h | P1 |
| **P3** | IndexedDB本地队列 | 3h | P2 |
| **P4** | 批量写入优化 | 2h | P2 |
| **P5** | 集成测试 | 4h | P3, P4 |
| **总计** | | **24h** | |

### 7.2 详细任务

#### P0: 数据库迁移

```sql
-- 1. 创建新表
-- 2. 迁移现有数据（如果有）
-- 3. 创建函数
-- 4. 创建索引
-- 5. 设置TTL
```

#### P1: CartMergeEngine

```typescript
// 实现：
// - readRegister()
// - mergeRegisters()
// - applyOp()
// - 单元测试（覆盖所有边界情况）
```

#### P2: useCartV3 Hook

```typescript
// 实现：
// - useQuery获取epoch和state
// - useMutation推送操作
// - 乐观更新逻辑
// - Visibility API集成
```

#### P3: IndexedDB本地队列

```typescript
// 实现：
// - 操作持久化
// - 离线支持
// - 断点续传
```

#### P4: 批量写入优化

```typescript
// 实现：
// - 操作合并
// - 批量RPC
// - 防抖策略
```

#### P5: 集成测试

```typescript
// 测试场景：
// - 单机多标签同步
// - 双设备并发INC
// - REMOVE后INC（顺序无关）
// - CLEAR后旧操作被忽略
// - 高频点击（100次/秒）
// - 离线后恢复
```

---

## 8. 风险评估

### 8.1 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| PN-Counter理解错误 | 低 | 高 | 架构师审查+单元测试 |
| PostgreSQL并发性能 | 中 | 中 | 压力测试+索引优化 |
| IndexedDB兼容性 | 低 | 中 | 降级到localStorage |
| 数据迁移失败 | 低 | 高 | 蓝绿部署+回滚方案 |

### 8.2 业务风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 用户购物车数据丢失 | 低 | 极高 | 完整备份+灰度发布 |
| 性能下降 | 中 | 高 | A/B测试+监控 |
| 用户体验变化 | 中 | 中 | 用户测试+反馈收集 |

---

## 9. 附录

### 9.1 数学证明：PN-Counter可交换性

```
定理：PN-Counter操作是可交换的

证明：
设有两个操作 INC(a) 和 INC(b)

情况1：顺序执行 INC(a) → INC(b)
  qty_pos = 0 + 1 + 1 = 2

情况2：顺序执行 INC(b) → INC(a)
  qty_pos = 0 + 1 + 1 = 2

结果相同，因此 INC 是可交换的。

同理可证 DEC 也是可交换的。

对于混合操作 INC(a) 和 DEC(b)：
  qty = qty_pos - qty_neg
  最终结果 = (a) - (b) = a - b

与顺序无关，因此 PN-Counter 整体是可交换的。
∎
```

### 9.2 数学证明：REMOVE幂等性

```
定理：REMOVE操作是幂等的

证明：
设 REMOVE 设置 remove_revision = qty_revision + 1

情况1：先INC后REMOVE
  INC:  qty_pos=1, qty_revision=1
  REMOVE: remove_revision = 1 + 1 = 2
  可见性检查: remove_revision(2) >= qty_revision(1) → 不可见 ✓

情况2：先REMOVE后INC
  REMOVE: remove_revision = 0 + 1 = 1, qty_revision=0
  INC:    qty_pos=1, qty_revision=1
  可见性检查: remove_revision(1) >= qty_revision(1) → 不可见 ✓

情况3：多次REMOVE
  第一次REMOVE: remove_revision = 1
  第二次REMOVE: remove_revision = max(1, 当前qty_revision+1)
  结果相同，幂等 ✓

∎
```

### 9.3 对比表：v2.0 vs v3.0 vs v3.1

| 特性 | v2.0 (Snapshot) | v3.0 (OCC) | v3.1 (PN-Counter) |
|------|----------------|-----------|-------------------|
| 数据模型 | JSONB Snapshot | Register | PN-Counter Hybrid |
| 冲突解决 | Last-Write-Wins | OCC (CAS) | G-Counter Merge |
| 离线Merge | ❌ 丢数据 | ❌ 冲突 | ✅ 自动合并 |
| 并发写入 | ❌ 串行 | ❌ FOR UPDATE | ✅ 无锁 |
| 高频点击 | ❌ 丢Intent | ❌ 冲突 | ✅ 全成功 |
| REMOVE语义 | ❌ 顺序敏感 | ⚠️ Tombstone | ✅ 幂等 |
| CLEAR性能 | O(n) | O(1) | O(1) |
| 移动端安全 | 🔴 不安全 | 🟠 部分安全 | ✅ 完全安全 |

---

## 10. 结论

v3.1通过引入**PN-Counter Hybrid Register**模型，彻底解决了v3.0的OCC问题：

1. ✅ **可交换性**：INC/DEC通过pos/neg分离实现真正的可交换
2. ✅ **幂等性**：REMOVE通过revision比较实现幂等
3. ✅ **无锁并发**：移除FOR UPDATE，利用PostgreSQL原子UPDATE
4. ✅ **Write Fence**：epoch检查防止Zombie Resurrection
5. ✅ **离线Merge**：PN-Counter天然支持离线操作合并

**推荐立即实施v3.1架构**。
