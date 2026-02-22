# 购物车系统优化实施计划 v3.0

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档版本 | v3.0 |
| 创建日期 | 2026-02-14 |
| 更新日期 | 2026-02-14 |
| 作者 | AI Assistant |
| 审查状态 | 待总架构师最终审查 |
| 架构级别 | SKU-Scoped Register + Epoch |

---

## 一、架构师审查反馈（v2.0 → v3.0）

### 1.1 v2.0 核心问题

| 问题 | 严重程度 | 现象 | 根因 |
|------|---------|------|------|
| **client_ts排序** | 🔴 P0 | 商品复活（Zombie Item） | 物理时间无法做因果排序 |
| **REMOVE无Tombstone** | 🔴 P0 | 删除无效 | 直接delete无法判断resurrection |
| **UPDATE_QTY存在** | 🔴 P0 | 数量跳变 | 非交换操作，无法merge |
| **CLEAR是O(n²)** | 🔴 P0 | UI冻结2-5秒 | 遍历所有ops找ADD |
| **Snapshot是只读** | 🟡 P1 | TTI随ops增长 | 客户端rebuild full cart |

### 1.2 范式转换

```
v2.0 模型（已废弃）：
Event Sourcing + Clock Sorting
    ↓
client_ts 排序
    ↓
apply(all_ops) 重建状态
    ↓
❌ 移动端必炸（商品复活、数量跳变）

v3.0 模型（推荐）：
SKU-Scoped Register + Epoch
    ↓
Per-SKU Revision 排序
    ↓
cart_registers 主读取模型
    ↓
OpLog 仅用于 Sync
    ↓
✅ Mobile-Safe
```

---

## 二、v3.0 核心架构设计

### 2.1 数据模型

```
┌─────────────────────────────────────────────────────────────────┐
│                     Server (Supabase)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              cart_registers (Primary)                    │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  user_id | sku | qty | selected | revision | epoch      │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  U1      | A#red#M | 3 | true    | 42       | 7        │    │
│  │  U1      | B#blue#L| 1 | false   | 15       | 7        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ▲                                   │
│                              │ Read (Primary)                    │
│  ┌───────────────────────────┴─────────────────────────────┐    │
│  │              cart_ops (Sync Only)                        │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  id | user_id | device_id | op | sku | payload | rev    │    │
│  │  ─────────────────────────────────────────────────────  │    │
│  │  1  | U1      | D1        | INC| A#red#M | {}     | 43   │    │
│  │  2  | U1      | D2        | SET| B#blue#L| {qty:2}| 16   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ Apply Ops                         │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              cart_epochs                                │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  user_id | current_epoch                                │    │
│  │  U1      | 7                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Sync / Broadcast
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     Client (Mobile/PC)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Local State (Memory)                        │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  registers: Map<SKU, Register>                          │    │
│  │  epoch: number                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ▲                                   │
│                              │ Patch (from Server)               │
│  ┌───────────────────────────┴─────────────────────────────┐    │
│  │              Local Op Queue (IndexedDB)                  │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  [{op: INC, sku: A#red#M, rev: 43}, ...]                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ Push                              │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Sync Engine                                 │    │
│  │         (Visibility API + Online Event)                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心类型定义

```typescript
// ============================================
// 服务器主模型：SKU-Scoped Register
// ============================================

interface CartRegister {
  user_id: string;
  sku: string;           // product_id#color#size
  qty: number;           // 当前数量
  selected: boolean;     // 选中状态
  revision: number;      // SKU级别版本号（单调递增）
  epoch: number;         // 购物车全局版本号
  updated_at: string;    // ISO timestamp
}

// SKU 解析
interface ParsedSKU {
  product_id: string;
  color?: string;
  size?: string;
}

function parseSKU(sku: string): ParsedSKU {
  const parts = sku.split('#');
  return {
    product_id: parts[0],
    color: parts[1] || undefined,
    size: parts[2] || undefined,
  };
}

function buildSKU(product_id: string, color?: string, size?: string): string {
  return [product_id, color, size].filter(Boolean).join('#');
}

// ============================================
// 操作类型（交换操作集）
// ============================================

type CartOp = 
  | { type: 'INC'; sku: string; delta: number }      // 增加数量
  | { type: 'DEC'; sku: string; delta: number }      // 减少数量
  | { type: 'SET'; sku: string; qty: number }        // 设置数量（携带revision）
  | { type: 'SELECT'; sku: string }                  // 选中
  | { type: 'DESELECT'; sku: string }                // 取消选中
  | { type: 'REMOVE'; sku: string; tombstone: true } // 标记删除（Tombstone）
  | { type: 'EPOCH'; epoch: number };                // 全局清空

// 操作记录（存储于 cart_ops）
interface CartOperation {
  id?: string;
  user_id?: string;
  device_id: string;
  op: CartOp;
  revision: number;      // 操作的目标revision
  client_ts: number;     // 用于debug，不参与排序
  created_at?: string;
}

// ============================================
// 客户端状态
// ============================================

interface CartState {
  registers: Map<string, CartRegister>;  // SKU -> Register
  epoch: number;                          // 当前epoch
}

// ============================================
// API 类型
// ============================================

// 从服务器获取：当前完整状态
interface CartSyncResponse {
  registers: CartRegister[];
  epoch: number;
  last_revision: number;  // 用于增量同步
}

// 推送到服务器：操作列表
interface CartPushRequest {
  ops: CartOperation[];
  base_revision: number;  // 基于哪个版本做的修改
}

// 服务器广播：增量更新
interface CartDelta {
  register_updates: CartRegister[];  // 变更的SKU
  new_epoch?: number;                // 如果有EPOCH操作
}
```

---

## 三、数据库设计

### 3.1 cart_registers（主读取模型）

```sql
-- SKU级别寄存器（主读取模型）
CREATE TABLE cart_registers (
  -- 主键：用户 + SKU
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  
  -- 寄存器值
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  selected BOOLEAN NOT NULL DEFAULT true,
  
  -- 版本控制
  revision INTEGER NOT NULL DEFAULT 1,  -- SKU级别版本号
  epoch INTEGER NOT NULL DEFAULT 1,     -- 购物车全局版本号
  
  -- 元数据
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id, sku)
);

-- 索引
CREATE INDEX idx_cart_registers_user_epoch ON cart_registers(user_id, epoch);
CREATE INDEX idx_cart_registers_revision ON cart_registers(user_id, revision DESC);

-- RLS
ALTER TABLE cart_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_registers_select_own ON cart_registers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_registers_insert_own ON cart_registers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_registers_update_own ON cart_registers FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE cart_registers IS '购物车SKU级别寄存器（主读取模型）';
COMMENT ON COLUMN cart_registers.revision IS 'SKU级别版本号，单调递增';
COMMENT ON COLUMN cart_registers.epoch IS '购物车全局版本号，用于CLEAR';
```

### 3.2 cart_ops（仅用于Sync）

```sql
-- 操作日志（仅用于多端同步，不用于读取）
CREATE TABLE cart_ops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  
  -- 操作内容
  op_type TEXT NOT NULL CHECK (op_type IN ('INC', 'DEC', 'SET', 'SELECT', 'DESELECT', 'REMOVE', 'EPOCH')),
  sku TEXT,  -- EPOCH操作时可为NULL
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- 版本控制
  revision INTEGER NOT NULL,  -- 操作的目标revision
  epoch INTEGER,              -- EPOCH操作时的epoch
  
  -- 时间戳（仅用于debug和清理）
  client_ts BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- 7天过期
  
  -- 同步状态
  synced BOOLEAN DEFAULT FALSE
);

-- 索引
CREATE INDEX idx_cart_ops_user ON cart_ops(user_id, created_at DESC);
CREATE INDEX idx_cart_ops_user_revision ON cart_ops(user_id, revision);
CREATE INDEX idx_cart_ops_unsynced ON cart_ops(user_id, synced) WHERE synced = FALSE;
CREATE INDEX idx_cart_ops_expires ON cart_ops(expires_at);

-- RLS
ALTER TABLE cart_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_ops_select_own ON cart_ops FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_ops_insert_own ON cart_ops FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE cart_ops IS '购物车操作日志（仅用于同步），7天自动清理';
```

### 3.3 cart_epochs（全局版本）

```sql
-- 购物车全局版本号
CREATE TABLE cart_epochs (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE cart_epochs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_epochs_select_own ON cart_epochs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_epochs_insert_own ON cart_epochs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_epochs_update_own ON cart_epochs FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE cart_epochs IS '购物车全局版本号，用于CLEAR操作';
```

---

## 四、核心算法

### 4.1 服务器端：应用操作

```typescript
// 服务器端：原子性应用操作
async function applyOperation(
  userId: string,
  op: CartOperation
): Promise<CartRegister | null> {
  return await supabase.rpc('apply_cart_op', {
    p_user_id: userId,
    p_device_id: op.device_id,
    p_op_type: op.op.type,
    p_sku: op.op.sku,
    p_payload: op.op,
    p_revision: op.revision,
  });
}

// PostgreSQL 函数
/*
CREATE OR REPLACE FUNCTION apply_cart_op(
  p_user_id UUID,
  p_device_id TEXT,
  p_op_type TEXT,
  p_sku TEXT,
  p_payload JSONB,
  p_revision INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_current cart_registers%ROWTYPE;
  v_new_revision INTEGER;
  v_epoch INTEGER;
BEGIN
  -- 获取当前寄存器值（带锁）
  SELECT * INTO v_current
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku
  FOR UPDATE;
  
  -- 获取当前epoch
  SELECT current_epoch INTO v_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  -- 如果SKU被CLEAR（epoch过期），忽略此操作
  IF v_current.epoch < v_epoch THEN
    RETURN NULL;
  END IF;
  
  -- 乐观锁检查：revision必须匹配
  IF v_current.revision != p_revision THEN
    -- revision不匹配，返回当前值让客户端解决
    RETURN jsonb_build_object(
      'conflict', true,
      'current', row_to_json(v_current)
    );
  END IF;
  
  -- 计算新revision
  v_new_revision := v_current.revision + 1;
  
  -- 应用操作
  CASE p_op_type
    WHEN 'INC' THEN
      UPDATE cart_registers
      SET qty = qty + (p_payload->>'delta')::INTEGER,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
      
    WHEN 'DEC' THEN
      UPDATE cart_registers
      SET qty = GREATEST(0, qty - (p_payload->>'delta')::INTEGER),
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
      
    WHEN 'SET' THEN
      UPDATE cart_registers
      SET qty = (p_payload->>'qty')::INTEGER,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
      
    WHEN 'SELECT' THEN
      UPDATE cart_registers
      SET selected = true,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
      
    WHEN 'DESELECT' THEN
      UPDATE cart_registers
      SET selected = false,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
      
    WHEN 'REMOVE' THEN
      -- Tombstone：不删除，设置qty=0
      UPDATE cart_registers
      SET qty = 0,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
  END CASE;
  
  -- 返回更新后的值
  SELECT * INTO v_current
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku;
  
  RETURN row_to_json(v_current);
END;
$$ LANGUAGE plpgsql;
*/
```

### 4.2 服务器端：CLEAR（Epoch机制）

```typescript
// CLEAR = Epoch++，O(1) 复杂度
async function clearCart(userId: string): Promise<number> {
  const { data } = await supabase.rpc('increment_cart_epoch', {
    p_user_id: userId,
  });
  return data; // 返回新的epoch
}

// PostgreSQL 函数
/*
CREATE OR REPLACE FUNCTION increment_cart_epoch(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_new_epoch INTEGER;
BEGIN
  INSERT INTO cart_epochs (user_id, current_epoch)
  VALUES (p_user_id, 2)
  ON CONFLICT (user_id)
  DO UPDATE SET 
    current_epoch = cart_epochs.current_epoch + 1,
    updated_at = NOW()
  RETURNING current_epoch INTO v_new_epoch;
  
  -- 记录EPOCH操作
  INSERT INTO cart_ops (user_id, device_id, op_type, revision, epoch)
  VALUES (p_user_id, 'server', 'EPOCH', 0, v_new_epoch);
  
  RETURN v_new_epoch;
END;
$$ LANGUAGE plpgsql;
*/
```

### 4.3 客户端：读取过滤

```typescript
// 客户端：过滤掉被CLEAR的SKU（O(1)）
function filterValidRegisters(
  registers: CartRegister[],
  currentEpoch: number
): CartRegister[] {
  return registers.filter(r => 
    r.epoch >= currentEpoch &&  // 未被CLEAR
    r.qty > 0                    // 未被REMOVE（Tombstone）
  );
}

// 转换为UI需要的格式
function toCartItems(registers: CartRegister[]): CartItem[] {
  return registers.map(r => {
    const { product_id, color, size } = parseSKU(r.sku);
    return {
      sku: r.sku,
      product_id,
      color,
      size,
      qty: r.qty,
      selected: r.selected,
      // ... 其他字段从product表获取
    };
  });
}
```

---

## 五、客户端架构

### 5.1 Hook设计

```typescript
// useCartV3.ts - v3.0 购物车Hook
export function useCartV3() {
  const { user } = useAuth();
  const [registers, setRegisters] = useState<Map<string, CartRegister>>(new Map());
  const [epoch, setEpoch] = useState(1);
  const [pendingOps, setPendingOps] = useState<CartOperation[]>([]);
  const deviceId = useRef(getOrCreateDeviceId());
  const revisionRef = useRef<Record<string, number>>({}); // SKU -> revision
  
  // ==========================================
  // 初始化：从服务器加载完整状态
  // ==========================================
  useEffect(() => {
    if (!user) return;
    
    loadCartFromServer().then(({ registers: regs, epoch: e }) => {
      const map = new Map(regs.map(r => [r.sku, r]));
      setRegisters(map);
      setEpoch(e);
      
      // 初始化revision追踪
      regs.forEach(r => {
        revisionRef.current[r.sku] = r.revision;
      });
    });
  }, [user]);
  
  // ==========================================
  // 操作创建（乐观更新）
  // ==========================================
  const createOp = useCallback((op: CartOp): CartOperation => {
    const sku = 'sku' in op ? op.sku : '';
    const currentRevision = revisionRef.current[sku] || 1;
    
    const operation: CartOperation = {
      device_id: deviceId.current,
      op,
      revision: currentRevision,
      client_ts: Date.now(),
    };
    
    // 乐观更新本地状态
    setRegisters(prev => {
      const next = new Map(prev);
      const current = next.get(sku);
      
      switch (op.type) {
        case 'INC':
          if (current) {
            current.qty += op.delta;
            current.revision++;
          }
          break;
        case 'DEC':
          if (current) {
            current.qty = Math.max(0, current.qty - op.delta);
            current.revision++;
          }
          break;
        case 'SET':
          if (current) {
            current.qty = op.qty;
            current.revision++;
          }
          break;
        case 'SELECT':
          if (current) {
            current.selected = true;
            current.revision++;
          }
          break;
        case 'DESELECT':
          if (current) {
            current.selected = false;
            current.revision++;
          }
          break;
        case 'REMOVE':
          if (current) {
            current.qty = 0; // Tombstone
            current.revision++;
          }
          break;
        case 'EPOCH':
          // CLEAR：清空所有SKU
          next.clear();
          setEpoch(op.epoch);
          break;
      }
      
      // 更新revision追踪
      if (current) {
        revisionRef.current[sku] = current.revision;
      }
      
      return next;
    });
    
    // 加入待同步队列
    setPendingOps(prev => [...prev, operation]);
    savePendingOp(operation);
    
    return operation;
  }, []);
  
  // ==========================================
  // 同步引擎
  // ==========================================
  const sync = useCallback(async () => {
    if (!user || pendingOps.length === 0) return;
    
    const opsToSync = [...pendingOps];
    
    try {
      const response = await fetch('/api/cart/v3/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ops: opsToSync,
          base_epoch: epoch,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // 处理冲突
        if (result.conflicts) {
          result.conflicts.forEach((conflict: any) => {
            // 服务器值覆盖本地
            setRegisters(prev => {
              const next = new Map(prev);
              next.set(conflict.sku, conflict.current);
              revisionRef.current[conflict.sku] = conflict.current.revision;
              return next;
            });
          });
        }
        
        // 确认已同步
        setPendingOps(prev => 
          prev.filter(op => !opsToSync.find(o => o.client_ts === op.client_ts))
        );
        clearSyncedOps(opsToSync);
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }, [user, pendingOps, epoch]);
  
  // ==========================================
  // 拉取更新
  // ==========================================
  const pull = useCallback(async () => {
    if (!user) return;
    
    const lastRevision = Math.max(...Object.values(revisionRef.current), 0);
    
    try {
      const response = await fetch(`/api/cart/v3/pull?since=${lastRevision}`);
      if (response.ok) {
        const { updates, new_epoch }: CartDelta = await response.json();
        
        // 应用增量更新
        setRegisters(prev => {
          const next = new Map(prev);
          updates.forEach(reg => {
            const current = next.get(reg.sku);
            // 只应用更新的revision
            if (!current || reg.revision > current.revision) {
              next.set(reg.sku, reg);
              revisionRef.current[reg.sku] = reg.revision;
            }
          });
          return next;
        });
        
        // 更新epoch
        if (new_epoch && new_epoch > epoch) {
          setEpoch(new_epoch);
          // 重新过滤（CLEAR可能删除了SKU）
          setRegisters(prev => {
            const next = new Map();
            prev.forEach((reg, sku) => {
              if (reg.epoch >= new_epoch) {
                next.set(sku, reg);
              }
            });
            return next;
          });
        }
      }
    } catch (error) {
      console.error('Pull failed:', error);
    }
  }, [user, epoch]);
  
  // ==========================================
  // 移动端可靠的同步触发
  // ==========================================
  useEffect(() => {
    if (!user) return;
    
    // 页面可见时同步
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pull();
        sync();
      }
    };
    
    // 网络恢复时同步
    const handleOnline = () => {
      sync();
      pull();
    };
    
    // pendingOps变化时同步
    sync();
    
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [user, pendingOps, sync, pull]);
  
  // ==========================================
  // 派生状态
  // ==========================================
  const cartItems = useMemo(() => {
    const validRegs = filterValidRegisters(Array.from(registers.values()), epoch);
    return toCartItems(validRegs);
  }, [registers, epoch]);
  
  const selectedItems = useMemo(() => 
    cartItems.filter(item => item.selected),
  [cartItems]);
  
  const total = useMemo(() => 
    selectedItems.reduce((sum, item) => sum + (item.price * item.qty), 0),
  [selectedItems]);
  
  // ==========================================
  // 公开API
  // ==========================================
  return {
    items: cartItems,
    selectedItems,
    total,
    pendingCount: pendingOps.length,
    
    // 操作
    addItem: (sku: string, qty: number) => createOp({ type: 'INC', sku, delta: qty }),
    removeItem: (sku: string) => createOp({ type: 'REMOVE', sku, tombstone: true }),
    updateQty: (sku: string, qty: number) => createOp({ type: 'SET', sku, qty }),
    select: (sku: string) => createOp({ type: 'SELECT', sku }),
    deselect: (sku: string) => createOp({ type: 'DESELECT', sku }),
    clear: () => createOp({ type: 'EPOCH', epoch: epoch + 1 }),
    
    // 同步
    sync,
    pull,
  };
}
```

---

## 六、API设计

### 6.1 推送操作

```typescript
// POST /api/cart/v3/push
interface PushRequest {
  ops: CartOperation[];
  base_epoch: number;
}

interface PushResponse {
  success: boolean;
  updated_registers: CartRegister[];  // 成功更新的SKU
  conflicts?: {                       // 乐观锁冲突
    sku: string;
    current: CartRegister;            // 服务器当前值
  }[];
  new_epoch?: number;                 // 如果有CLEAR操作
}

// 服务器实现
export async function POST(request: Request) {
  const { ops, base_epoch } = await request.json();
  const user = await getCurrentUser();
  
  const results = [];
  const conflicts = [];
  let new_epoch = base_epoch;
  
  for (const op of ops) {
    // 检查epoch
    if (op.op.type === 'EPOCH') {
      new_epoch = await clearCart(user.id);
      continue;
    }
    
    // 应用操作
    const result = await applyOperation(user.id, op);
    
    if (result.conflict) {
      conflicts.push({
        sku: op.op.sku,
        current: result.current,
      });
    } else {
      results.push(result);
    }
  }
  
  return Response.json({
    success: true,
    updated_registers: results,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    new_epoch: new_epoch !== base_epoch ? new_epoch : undefined,
  });
}
```

### 6.2 拉取更新

```typescript
// GET /api/cart/v3/pull?since={revision}
interface PullResponse {
  updates: CartRegister[];  // revision > since 的SKU
  new_epoch?: number;       // 如果有CLEAR操作
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = parseInt(searchParams.get('since') || '0');
  const user = await getCurrentUser();
  
  // 获取更新的registers
  const { data: updates } = await supabase
    .from('cart_registers')
    .select('*')
    .eq('user_id', user.id)
    .gt('revision', since);
  
  // 获取当前epoch
  const { data: epochData } = await supabase
    .from('cart_epochs')
    .select('current_epoch')
    .eq('user_id', user.id)
    .single();
  
  return Response.json({
    updates: updates || [],
    new_epoch: epochData?.current_epoch,
  });
}
```

### 6.3 获取完整状态（初始化）

```typescript
// GET /api/cart/v3/state
interface StateResponse {
  registers: CartRegister[];
  epoch: number;
  last_revision: number;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  
  const [{ data: registers }, { data: epoch }] = await Promise.all([
    supabase
      .from('cart_registers')
      .select('*')
      .eq('user_id', user.id),
    supabase
      .from('cart_epochs')
      .select('current_epoch')
      .eq('user_id', user.id)
      .single(),
  ]);
  
  const last_revision = Math.max(
    ...(registers || []).map(r => r.revision),
    0
  );
  
  return Response.json({
    registers: registers || [],
    epoch: epoch?.current_epoch || 1,
    last_revision,
  });
}
```

---

## 七、实施计划

### 7.1 阶段划分

| 阶段 | 内容 | 工时 |
|------|------|------|
| **P0** | 数据库迁移（3个表） | 2h |
| **P1** | PostgreSQL函数（apply_cart_op, increment_epoch） | 3h |
| **P2** | API接口（push, pull, state） | 3h |
| **P3** | useCartV3 Hook | 4h |
| **P4** | IndexedDB本地队列 | 2h |
| **P5** | 组件集成与测试 | 3h |
| **总计** | | **17h** |

### 7.2 文件清单

**新建文件**:
- `supabase/migrations/232_cart_v3.sql` - 数据库迁移
- `src/lib/cart/types.ts` - 类型定义
- `src/lib/cart/sku.ts` - SKU解析/构建
- `src/lib/hooks/useCartV3.ts` - 主Hook
- `src/lib/cart/db.ts` - IndexedDB封装
- `src/app/api/cart/v3/push/route.ts` - 推送API
- `src/app/api/cart/v3/pull/route.ts` - 拉取API
- `src/app/api/cart/v3/state/route.ts` - 状态API

**修改文件**:
- `src/app/[locale]/(main)/cart/page.tsx` - 使用useCartV3
- `src/app/[locale]/(main)/checkout/page.tsx` - 结算页适配

---

## 八、测试策略

### 8.1 关键测试场景

| 场景 | 设备A | 设备B | 期望结果 |
|------|-------|-------|---------|
| **并发INC** | INC A +1 | INC A +1 | A qty = 原+2 |
| **INC+DEC** | INC A +5 | DEC A -2 | A qty = 原+3 |
| **SET覆盖** | SET A=10 | SET A=5 | 后执行者胜出 |
| **REMOVE复活** | REMOVE A | ADD A | A存在（新intent） |
| **CLEAR后ADD** | CLEAR | ADD B | 只有B |
| **Epoch过滤** | - | - | epoch<current的SKU被过滤 |
| **乐观锁冲突** | SET A=5 (rev=1) | SET A=10 (rev=1) | 冲突返回，客户端重试 |

### 8.2 性能测试

| 指标 | 目标 | 测试方法 |
|------|------|---------|
| CLEAR操作 | < 50ms | 1000个SKU的购物车 |
| 状态加载 | < 200ms | 100个SKU |
| 同步延迟 | < 1s | 模拟3G网络 |
| 内存占用 | < 10MB | 1000个SKU |

---

## 九、附录

### 9.1 完整数据库迁移

```sql
-- 232_cart_v3.sql
-- 购物车v3.0：SKU-Scoped Register + Epoch

-- 1. SKU级别寄存器（主读取模型）
CREATE TABLE cart_registers (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  selected BOOLEAN NOT NULL DEFAULT true,
  revision INTEGER NOT NULL DEFAULT 1,
  epoch INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, sku)
);

CREATE INDEX idx_cart_registers_user_epoch ON cart_registers(user_id, epoch);
CREATE INDEX idx_cart_registers_revision ON cart_registers(user_id, revision DESC);

ALTER TABLE cart_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_registers_select_own ON cart_registers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_registers_insert_own ON cart_registers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_registers_update_own ON cart_registers FOR UPDATE USING (auth.uid() = user_id);

-- 2. 操作日志（仅用于同步）
CREATE TABLE cart_ops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('INC', 'DEC', 'SET', 'SELECT', 'DESELECT', 'REMOVE', 'EPOCH')),
  sku TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL,
  epoch INTEGER,
  client_ts BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  synced BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_cart_ops_user ON cart_ops(user_id, created_at DESC);
CREATE INDEX idx_cart_ops_user_revision ON cart_ops(user_id, revision);
CREATE INDEX idx_cart_ops_unsynced ON cart_ops(user_id, synced) WHERE synced = FALSE;
CREATE INDEX idx_cart_ops_expires ON cart_ops(expires_at);

ALTER TABLE cart_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_ops_select_own ON cart_ops FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_ops_insert_own ON cart_ops FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. 全局版本号
CREATE TABLE cart_epochs (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cart_epochs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_epochs_select_own ON cart_epochs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_epochs_insert_own ON cart_epochs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_epochs_update_own ON cart_epochs FOR UPDATE USING (auth.uid() = user_id);

-- 4. 应用操作函数
CREATE OR REPLACE FUNCTION apply_cart_op(
  p_user_id UUID,
  p_device_id TEXT,
  p_op_type TEXT,
  p_sku TEXT,
  p_payload JSONB,
  p_revision INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_current cart_registers%ROWTYPE;
  v_new_revision INTEGER;
  v_epoch INTEGER;
BEGIN
  SELECT * INTO v_current
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku
  FOR UPDATE;
  
  SELECT current_epoch INTO v_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current.epoch < v_epoch THEN
    RETURN NULL;
  END IF;
  
  IF v_current.revision != p_revision THEN
    RETURN jsonb_build_object(
      'conflict', true,
      'current', row_to_json(v_current)
    );
  END IF;
  
  v_new_revision := v_current.revision + 1;
  
  CASE p_op_type
    WHEN 'INC' THEN
      UPDATE cart_registers
      SET qty = qty + (p_payload->>'delta')::INTEGER,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
    WHEN 'DEC' THEN
      UPDATE cart_registers
      SET qty = GREATEST(0, qty - (p_payload->>'delta')::INTEGER),
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
    WHEN 'SET' THEN
      UPDATE cart_registers
      SET qty = (p_payload->>'qty')::INTEGER,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
    WHEN 'SELECT' THEN
      UPDATE cart_registers
      SET selected = true,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
    WHEN 'DESELECT' THEN
      UPDATE cart_registers
      SET selected = false,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
    WHEN 'REMOVE' THEN
      UPDATE cart_registers
      SET qty = 0,
          revision = v_new_revision,
          updated_at = NOW()
      WHERE user_id = p_user_id AND sku = p_sku;
  END CASE;
  
  SELECT * INTO v_current
  FROM cart_registers
  WHERE user_id = p_user_id AND sku = p_sku;
  
  RETURN row_to_json(v_current);
END;
$$ LANGUAGE plpgsql;

-- 5. 递增epoch函数
CREATE OR REPLACE FUNCTION increment_cart_epoch(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_new_epoch INTEGER;
BEGIN
  INSERT INTO cart_epochs (user_id, current_epoch)
  VALUES (p_user_id, 2)
  ON CONFLICT (user_id)
  DO UPDATE SET 
    current_epoch = cart_epochs.current_epoch + 1,
    updated_at = NOW()
  RETURNING current_epoch INTO v_new_epoch;
  
  INSERT INTO cart_ops (user_id, device_id, op_type, revision, epoch)
  VALUES (p_user_id, 'server', 'EPOCH', 0, v_new_epoch);
  
  RETURN v_new_epoch;
END;
$$ LANGUAGE plpgsql;

-- 6. 自动清理过期操作
CREATE OR REPLACE FUNCTION cleanup_expired_cart_ops()
RETURNS void AS $$
BEGIN
  DELETE FROM cart_ops WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 注释
COMMENT ON TABLE cart_registers IS '购物车SKU级别寄存器（主读取模型），Tombstone模式';
COMMENT ON TABLE cart_ops IS '购物车操作日志（仅用于同步），7天过期';
COMMENT ON TABLE cart_epochs IS '购物车全局版本号，用于CLEAR操作';
```

---

*文档结束 - 等待总架构师最终确认*
