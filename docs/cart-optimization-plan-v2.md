# 购物车系统优化实施计划 v2.0

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档版本 | v2.0 |
| 创建日期 | 2026-02-14 |
| 更新日期 | 2026-02-14 |
| 作者 | AI Assistant |
| 审查状态 | 待总架构师最终审查 |
| 架构级别 | 分布式状态系统（Mobile-First） |

---

## 一、架构师审查反馈摘要

### 1.1 v1.2 版本问题总结

| 问题 | 严重程度 | 影响范围 | 根本原因 |
|------|---------|---------|---------|
| **伪双写系统** | 🔴 致命 | 移动端数量修改永不生效 | `max(quantity)` 合并策略违背用户意图 |
| **缺少 Version Vector** | 🔴 致命 | 无法区分删除vs增加 | JSONB Snapshot 无操作语义 |
| **selected_ids 设计错误** | 🟡 严重 | 变体选中状态错乱 | 未考虑 `color/size` 变体 |
| **移动端同步失效** | 🔴 致命 | PWA/后台/锁屏时同步停止 | `setInterval` 在移动端不可靠 |

### 1.2 架构范式转变

```
v1.2 模型（已废弃）：
State Sync (Snapshot-based)
    ↓
localStorage ↔ Supabase JSONB
    ↓
Last Write Wins (LWW)
    ↓
❌ 移动端数据必炸

v2.0 模型（推荐）：
Operation Sync (OpLog-based)
    ↓
Local Op Queue ↔ Server Op Log
    ↓
CRDT-lite (意图重放)
    ↓
✅ Mobile-First 正确性
```

---

## 二、v2.0 核心架构设计

### 2.1 Operation-based Sync 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │   UI Layer   │    │  Cart State  │    │  Op Log DB   │      │
│   │              │    │              │    │  (IndexedDB) │      │
│   │  Optimistic  │◄───│  apply(ops)  │◄───│  queue + log │      │
│   │    Update    │    │              │    │              │      │
│   └──────┬───────┘    └──────────────┘    └──────────────┘      │
│          │                                                       │
│          │ User Action                                           │
│          ▼                                                       │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │  Op Creator  │───►│  Sync Engine │───►│   Network    │      │
│   │              │    │(Visibility+SW)│   │   (Fetch)    │      │
│   └──────────────┘    └──────────────┘    └──────────────┘      │
│                              │                                   │
│                              │ Push Ops                           │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Server Layer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────────────────────────────────┐      │
│   │              cart_operations (Op Log)                 │      │
│   ├──────────────────────────────────────────────────────┤      │
│   │  id | user_id | device_id | op_type | sku | payload  │      │
│   │       ts | client_ts | server_ts | ack | retry       │      │
│   └──────────────────────────────────────────────────────┘      │
│                              │                                   │
│                              │ Broadcast                          │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────┐      │
│   │              Realtime / Polling Layer                 │      │
│   │         (Supabase Realtime / Manual Poll)            │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心概念定义

| 概念 | 定义 | 示例 |
|------|------|------|
| **SKU** | 库存单位标识符 | `{product_id}-{color}-{size}` 或独立 SKU ID |
| **Operation** | 用户意图的原子操作 | `ADD`, `REMOVE`, `UPDATE_QTY`, `SELECT`, `DESELECT` |
| **Op Log** | 有序操作序列 | `[{op: ADD, sku: A-red-M, qty: 1, ts: 123}]` |
| **State** | 当前购物车状态 | 通过 `apply(op_log)` 计算得出 |
| **Vector Clock** | 逻辑时间戳 | `{device_id: counter}` 用于冲突检测 |

### 2.3 与 v1.2 的关键差异

| 维度 | v1.2 (Snapshot) | v2.0 (Operation) |
|------|-----------------|------------------|
| **存储内容** | 购物车当前状态 | 用户操作历史 |
| **同步单位** | 整个购物车 JSON | 单个操作 |
| **冲突解决** | `max(quantity)` | 操作重放 + CRDT |
| **离线支持** | 无 | 本地 Op Queue |
| **多端并发** | LWW (数据丢失) | Op Merge (正确) |
| **移动端可靠** | ❌ | ✅ |

---

## 三、数据库设计

### 3.1 cart_operations 表（核心）

```sql
-- 购物车操作日志表（CRDT-lite 基础）
CREATE TABLE cart_operations (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 用户与设备标识
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL, -- 设备唯一标识 (UUIDv4)
  
  -- 操作类型
  op_type TEXT NOT NULL CHECK (op_type IN (
    'ADD',           -- 添加商品
    'REMOVE',        -- 移除商品
    'UPDATE_QTY',    -- 更新数量
    'SELECT',        -- 选中商品
    'DESELECT',      -- 取消选中
    'CLEAR'          -- 清空购物车
  )),
  
  -- SKU 标识 (解决变体问题)
  sku TEXT NOT NULL, -- 格式: {product_id}#{color}#{size}
  
  -- 操作载荷
  payload JSONB NOT NULL DEFAULT '{}',
  -- ADD: {qty: number, price: number, name: string, image: string, currency: string}
  -- REMOVE: {}
  -- UPDATE_QTY: {qty: number}
  -- SELECT/DESELECT: {}
  -- CLEAR: {}
  
  -- 时间戳系统 (Vector Clock)
  client_ts BIGINT NOT NULL, -- 客户端时间戳 (ms)
  client_seq INTEGER NOT NULL, -- 客户端序列号 (每设备递增)
  server_ts TIMESTAMPTZ DEFAULT NOW(), -- 服务器时间戳
  
  -- 向量时钟 (用于冲突检测)
  vector_clock JSONB NOT NULL DEFAULT '{}',
  -- 格式: {"device_A": 5, "device_B": 3}
  
  -- 同步状态
  synced BOOLEAN DEFAULT FALSE, -- 是否已广播给其他设备
  acked BOOLEAN DEFAULT FALSE,  -- 客户端是否确认收到
  
  -- 重试机制
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  
  -- 元数据
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days') -- 自动清理
);

-- 索引设计
CREATE INDEX idx_cart_ops_user_id ON cart_operations(user_id);
CREATE INDEX idx_cart_ops_user_device ON cart_operations(user_id, device_id);
CREATE INDEX idx_cart_ops_client_ts ON cart_operations(user_id, client_ts DESC);
CREATE INDEX idx_cart_ops_server_ts ON cart_operations(user_id, server_ts DESC);
CREATE INDEX idx_cart_ops_unsynced ON cart_operations(user_id, synced) WHERE synced = FALSE;
CREATE INDEX idx_cart_ops_expires ON cart_operations(expires_at);

-- 复合唯一约束 (防止重复操作)
CREATE UNIQUE INDEX idx_cart_ops_unique_op 
ON cart_operations(user_id, device_id, client_seq);

-- 启用 RLS
ALTER TABLE cart_operations ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY cart_ops_select_own
  ON cart_operations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY cart_ops_insert_own
  ON cart_operations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 注释
COMMENT ON TABLE cart_operations IS '购物车操作日志 (CRDT-lite), 保留30天';
COMMENT ON COLUMN cart_operations.sku IS 'SKU格式: product_id#color#size, 解决变体选中问题';
COMMENT ON COLUMN cart_operations.vector_clock IS '向量时钟,用于多端冲突检测';
```

### 3.2 cart_snapshots 表（缓存优化）

```sql
-- 购物车状态快照 (只读缓存,加速加载)
CREATE TABLE cart_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 计算后的状态
  items JSONB NOT NULL DEFAULT '[]', -- [{sku, qty, price, name, image, currency}]
  selected_skus TEXT[] DEFAULT '{}', -- 选中的 SKU 列表 (解决变体问题)
  
  -- 元数据
  last_op_id UUID REFERENCES cart_operations(id),
  last_op_ts BIGINT, -- 最后操作的 client_ts
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- 索引
CREATE INDEX idx_cart_snapshots_user ON cart_snapshots(user_id);

-- RLS
ALTER TABLE cart_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_snapshots_select_own ON cart_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_snapshots_insert_own ON cart_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_snapshots_update_own ON cart_snapshots FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE cart_snapshots IS '购物车状态快照 (只读), 由服务器计算';
```

---

## 四、客户端架构

### 4.1 数据流设计

```typescript
// 核心类型定义

interface CartOperation {
  id?: string;           // 服务器生成
  user_id?: string;      // 服务器填充
  device_id: string;     // 本地生成 UUID
  op_type: 'ADD' | 'REMOVE' | 'UPDATE_QTY' | 'SELECT' | 'DESELECT' | 'CLEAR';
  sku: string;           // product_id#color#size
  payload: OpPayload;
  client_ts: number;     // Date.now()
  client_seq: number;    // 本地递增序列号
  vector_clock: Record<string, number>;
}

interface OpPayload {
  qty?: number;
  price?: number;
  name?: string;
  image?: string;
  currency?: string;
}

interface CartItem {
  sku: string;
  product_id: string;
  color?: string;
  size?: string;
  qty: number;
  price: number;
  name: string;
  image: string;
  currency: string;
  selected: boolean;
}

// 状态计算函数 (纯函数,可预测)
function applyOperations(ops: CartOperation[]): CartItem[] {
  const state = new Map<string, CartItem>();
  
  // 按时间戳排序
  const sortedOps = ops.sort((a, b) => {
    if (a.client_ts !== b.client_ts) return a.client_ts - b.client_ts;
    return a.client_seq - b.client_seq;
  });
  
  for (const op of sortedOps) {
    switch (op.op_type) {
      case 'ADD':
        const existing = state.get(op.sku);
        if (existing) {
          existing.qty += op.payload.qty || 1;
        } else {
          const [product_id, color, size] = op.sku.split('#');
          state.set(op.sku, {
            sku: op.sku,
            product_id,
            color: color || undefined,
            size: size || undefined,
            qty: op.payload.qty || 1,
            price: op.payload.price || 0,
            name: op.payload.name || '',
            image: op.payload.image || '',
            currency: op.payload.currency || 'USD',
            selected: true, // 默认选中
          });
        }
        break;
        
      case 'REMOVE':
        state.delete(op.sku);
        break;
        
      case 'UPDATE_QTY':
        const item = state.get(op.sku);
        if (item) {
          item.qty = op.payload.qty || 1;
          if (item.qty <= 0) state.delete(op.sku);
        }
        break;
        
      case 'SELECT':
        const selectItem = state.get(op.sku);
        if (selectItem) selectItem.selected = true;
        break;
        
      case 'DESELECT':
        const deselectItem = state.get(op.sku);
        if (deselectItem) deselectItem.selected = false;
        break;
        
      case 'CLEAR':
        state.clear();
        break;
    }
  }
  
  return Array.from(state.values());
}
```

### 4.2 Hook 设计

```typescript
// useCartOpLog.ts - 操作日志管理
export function useCartOpLog() {
  const { user } = useAuth();
  const [localOps, setLocalOps] = useState<CartOperation[]>([]);
  const [pendingOps, setPendingOps] = useState<CartOperation[]>([]);
  const deviceId = useRef(getOrCreateDeviceId());
  const seqRef = useRef(0);
  
  // 从 IndexedDB 加载本地操作日志
  useEffect(() => {
    loadLocalOps().then(setLocalOps);
  }, []);
  
  // 创建操作
  const createOp = useCallback((
    opType: CartOperation['op_type'],
    sku: string,
    payload: OpPayload = {}
  ): CartOperation => {
    const op: CartOperation = {
      device_id: deviceId.current,
      op_type: opType,
      sku,
      payload,
      client_ts: Date.now(),
      client_seq: ++seqRef.current,
      vector_clock: {}, // 由 sync 引擎填充
    };
    
    // 立即保存到本地
    setLocalOps(prev => [...prev, op]);
    setPendingOps(prev => [...prev, op]);
    saveLocalOp(op);
    
    return op;
  }, []);
  
  // 确认操作已同步
  const ackOp = useCallback((clientSeq: number) => {
    setPendingOps(prev => prev.filter(op => op.client_seq !== clientSeq));
    markOpSynced(clientSeq);
  }, []);
  
  // 计算当前状态
  const cartState = useMemo(() => {
    return applyOperations(localOps);
  }, [localOps]);
  
  return {
    cartState,
    pendingOps,
    createOp,
    ackOp,
  };
}

// useCartSyncV2.ts - 移动端可靠的同步引擎
export function useCartSyncV2() {
  const { user } = useAuth();
  const { pendingOps, ackOp } = useCartOpLog();
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  
  // 推送操作到服务器
  const pushOps = useCallback(async () => {
    if (!user || pendingOps.length === 0) return;
    
    setSyncStatus('syncing');
    try {
      const response = await fetch('/api/cart/push-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: pendingOps }),
      });
      
      if (response.ok) {
        const { ackedSeqs } = await response.json();
        ackedSeqs.forEach(ackOp);
        setLastSyncAt(Date.now());
        setSyncStatus('idle');
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      console.error('Push ops failed:', error);
      setSyncStatus('error');
    }
  }, [user, pendingOps, ackOp]);
  
  // 拉取其他设备的操作
  const pullOps = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/cart/pull-ops?since=${lastSyncAt}`);
      if (response.ok) {
        const { ops } = await response.json();
        // 合并到本地
        ops.forEach(saveLocalOp);
        setLastSyncAt(Date.now());
      }
    } catch (error) {
      console.error('Pull ops failed:', error);
    }
  }, [user, lastSyncAt]);
  
  // 移动端可靠的触发机制
  useEffect(() => {
    if (!user) return;
    
    // 1. 页面可见性变化时同步 (解决后台/锁屏问题)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pullOps(); // 回到前台时拉取最新
        pushOps(); // 推送未同步的操作
      }
    };
    
    // 2. 网络恢复时同步
    const handleOnline = () => {
      pushOps();
      pullOps();
    };
    
    // 3. 定期同步 (60秒,但只在页面可见时)
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        pushOps();
        pullOps();
      }
    }, 60000);
    
    // 4. pendingOps 变化时立即尝试推送
    pushOps();
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      clearInterval(intervalId);
    };
  }, [user, pendingOps, pushOps, pullOps]);
  
  return {
    syncStatus,
    pendingCount: pendingOps.length,
    forceSync: () => { pushOps(); pullOps(); },
  };
}
```

---

## 五、CRDT-lite 冲突解决策略

### 5.1 冲突场景分析

| 场景 | 设备A | 设备B | 期望结果 | 策略 |
|------|-------|-------|---------|------|
| **并发添加** | Add A x1 | Add A x1 | A x2 | 数量累加 |
| **添加+删除** | Add A | Remove A | 空购物车 | 时间戳排序 |
| **并发修改数量** | Update A x5 | Update A x3 | A x5 | 取较大值 |
| **删除+修改** | Remove A | Update A x5 | A x5 | 修改覆盖删除 |
| **清空+添加** | Clear | Add B | 只有B | 时间戳排序 |

### 5.2 操作排序规则

```typescript
// 操作排序 (决定应用顺序)
function compareOps(a: CartOperation, b: CartOperation): number {
  // 1. 先按客户端时间戳
  if (a.client_ts !== b.client_ts) {
    return a.client_ts - b.client_ts;
  }
  
  // 2. 同设备按序列号
  if (a.device_id === b.device_id) {
    return a.client_seq - b.client_seq;
  }
  
  // 3. 不同设备: Vector Clock 比较
  const vcA = a.vector_clock[a.device_id] || 0;
  const vcB = b.vector_clock[b.device_id] || 0;
  
  if (vcA !== vcB) return vcA - vcB;
  
  // 4. 最后按设备ID字典序 (确定性)
  return a.device_id.localeCompare(b.device_id);
}

// 向量时钟更新
function updateVectorClock(
  localClock: Record<string, number>,
  incomingClock: Record<string, number>
): Record<string, number> {
  const result = { ...localClock };
  for (const [device, count] of Object.entries(incomingClock)) {
    result[device] = Math.max(result[device] || 0, count);
  }
  return result;
}
```

### 5.3 特殊操作处理

```typescript
// CLEAR 操作的特殊处理
// 问题: Clear 后添加的商品不应该被 Clear 删除
// 解决: Clear 只影响 Clear 时间戳之前的商品

function applyClearOp(
  state: Map<string, CartItem>,
  clearOp: CartOperation,
  allOps: CartOperation[]
): void {
  // 只删除在 Clear 操作之前添加的商品
  for (const [sku, item] of state) {
    const addOp = allOps.find(op => 
      op.op_type === 'ADD' && op.sku === sku
    );
    
    if (addOp && addOp.client_ts < clearOp.client_ts) {
      state.delete(sku);
    }
  }
}
```

---

## 六、移动端可靠性保障

### 6.1 IndexedDB 本地存储

```typescript
// db.ts - IndexedDB 封装
const DB_NAME = 'stratos-cart';
const DB_VERSION = 1;

interface CartDB extends DBSchema {
  operations: {
    key: number; // client_seq
    value: CartOperation;
    indexes: {
      by_timestamp: number;
      by_synced: boolean;
    };
  };
  pending: {
    key: number;
    value: CartOperation;
  };
}

async function initDB(): Promise<IDBPDatabase<CartDB>> {
  return openDB<CartDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 操作日志表
      const opStore = db.createObjectStore('operations', {
        keyPath: 'client_seq',
      });
      opStore.createIndex('by_timestamp', 'client_ts');
      opStore.createIndex('by_synced', 'synced');
      
      // 待同步队列
      db.createObjectStore('pending', { keyPath: 'client_seq' });
    },
  });
}

// 保存操作到本地
export async function saveLocalOp(op: CartOperation): Promise<void> {
  const db = await initDB();
  await db.put('operations', op);
  if (!op.synced) {
    await db.put('pending', op);
  }
}

// 加载所有本地操作
export async function loadLocalOps(): Promise<CartOperation[]> {
  const db = await initDB();
  return db.getAll('operations');
}

// 获取待同步操作
export async function getPendingOps(): Promise<CartOperation[]> {
  const db = await initDB();
  return db.getAll('pending');
}

// 标记操作已同步
export async function markOpSynced(clientSeq: number): Promise<void> {
  const db = await initDB();
  const op = await db.get('operations', clientSeq);
  if (op) {
    op.synced = true;
    await db.put('operations', op);
    await db.delete('pending', clientSeq);
  }
}
```

### 6.2 离线队列管理

```typescript
// 离线操作队列上限
const MAX_PENDING_OPS = 50;

// 队列满时的处理策略
function handleQueueFull(newOp: CartOperation, queue: CartOperation[]): CartOperation[] {
  // 策略: 压缩相同 SKU 的操作
  const skuOps = queue.filter(op => op.sku === newOp.sku);
  
  if (skuOps.length >= 3) {
    // 合并为单个 UPDATE_QTY 操作
    const mergedOp: CartOperation = {
      ...skuOps[skuOps.length - 1],
      op_type: 'UPDATE_QTY',
      payload: { qty: calculateFinalQty(skuOps) },
    };
    
    // 移除旧的相同 SKU 操作
    const filtered = queue.filter(op => op.sku !== newOp.sku);
    return [...filtered, mergedOp];
  }
  
  // 如果还是满,移除最旧的操作
  if (queue.length >= MAX_PENDING_OPS) {
    return [...queue.slice(1), newOp];
  }
  
  return [...queue, newOp];
}
```

### 6.3 网络恢复自动同步

```typescript
// NetworkStatus 监测
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
}

// 自动同步 Hook
export function useAutoSync() {
  const isOnline = useNetworkStatus();
  const { forceSync } = useCartSyncV2();
  
  useEffect(() => {
    if (isOnline) {
      // 网络恢复时立即同步
      forceSync();
    }
  }, [isOnline, forceSync]);
}
```

---

## 七、API 设计

### 7.1 推送操作

```typescript
// POST /api/cart/push-ops
interface PushOpsRequest {
  ops: CartOperation[];
}

interface PushOpsResponse {
  success: boolean;
  ackedSeqs: number[]; // 确认收到的 client_seq
  serverOps?: CartOperation[]; // 其他设备的新操作
  errors?: { seq: number; error: string }[];
}

// 服务器端处理
export async function POST(request: Request) {
  const { ops } = await request.json();
  const user = await getCurrentUser();
  
  const results = await Promise.all(
    ops.map(async (op) => {
      try {
        // 检查重复
        const existing = await supabase
          .from('cart_operations')
          .select('id')
          .eq('user_id', user.id)
          .eq('device_id', op.device_id)
          .eq('client_seq', op.client_seq)
          .single();
        
        if (existing.data) {
          return { seq: op.client_seq, status: 'duplicate' };
        }
        
        // 插入操作
        await supabase.from('cart_operations').insert({
          user_id: user.id,
          ...op,
          server_ts: new Date().toISOString(),
        });
        
        return { seq: op.client_seq, status: 'acked' };
      } catch (error) {
        return { seq: op.client_seq, status: 'error', error: error.message };
      }
    })
  );
  
  // 获取其他设备的操作
  const { data: serverOps } = await supabase
    .from('cart_operations')
    .select('*')
    .eq('user_id', user.id)
    .neq('device_id', ops[0]?.device_id)
    .gt('client_ts', Math.min(...ops.map(o => o.client_ts)))
    .order('client_ts', { ascending: true });
  
  return Response.json({
    success: true,
    ackedSeqs: results.filter(r => r.status === 'acked').map(r => r.seq),
    serverOps: serverOps || [],
  });
}
```

### 7.2 拉取操作

```typescript
// GET /api/cart/pull-ops?since={timestamp}&device_id={id}
interface PullOpsResponse {
  ops: CartOperation[];
  snapshot?: CartSnapshot; // 可选: 完整状态快照
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = parseInt(searchParams.get('since') || '0');
  const deviceId = searchParams.get('device_id');
  const user = await getCurrentUser();
  
  // 获取该用户所有操作
  const { data: ops } = await supabase
    .from('cart_operations')
    .select('*')
    .eq('user_id', user.id)
    .gt('client_ts', since)
    .order('client_ts', { ascending: true });
  
  // 标记为已同步
  if (deviceId) {
    await supabase
      .from('cart_operations')
      .update({ synced: true })
      .eq('user_id', user.id)
      .neq('device_id', deviceId)
      .gt('client_ts', since);
  }
  
  return Response.json({ ops: ops || [] });
}
```

---

## 八、实施计划

### 8.1 阶段划分

| 阶段 | 内容 | 工时 | 依赖 |
|------|------|------|------|
| **P0** | 结算页 UX 优化 (保留) | 2h | 无 |
| **P1-1** | 数据库迁移 (cart_operations) | 2h | P0 |
| **P1-2** | 核心 Hooks (useCartOpLog, useCartSyncV2) | 6h | P1-1 |
| **P1-3** | IndexedDB 本地存储 | 3h | P1-2 |
| **P1-4** | API 接口实现 | 2h | P1-1 |
| **P2** | 组件集成与测试 | 3h | P1-4 |
| **总计** | | **18h** | |

### 8.2 文件变更清单

**新建文件**:
- `src/lib/cart/db.ts` - IndexedDB 封装
- `src/lib/cart/operations.ts` - 操作类型与状态计算
- `src/lib/hooks/useCartOpLog.ts` - 操作日志管理
- `src/lib/hooks/useCartSyncV2.ts` - 同步引擎
- `src/lib/hooks/useNetworkStatus.ts` - 网络状态监测
- `src/app/api/cart/push-ops/route.ts` - 推送操作 API
- `src/app/api/cart/pull-ops/route.ts` - 拉取操作 API
- `supabase/migrations/231_cart_operations.sql` - 数据库迁移

**修改文件**:
- `src/store/cartStore.ts` - 适配新架构
- `src/app/[locale]/(main)/cart/page.tsx` - 集成同步状态
- `src/app/[locale]/(main)/checkout/page.tsx` - P0 优化

### 8.3 迁移策略

```
阶段1: 双系统并行 (2周)
  - 新系统上线
  - 旧数据自动迁移
  - 监控错误率

阶段2: 旧系统下线 (1周后)
  - 确认新系统稳定
  - 删除 user_carts 表
  - 清理旧代码
```

---

## 九、测试策略

### 9.1 单元测试

```typescript
// operations.test.ts
describe('applyOperations', () => {
  it('should add item correctly', () => {
    const ops: CartOperation[] = [
      { op_type: 'ADD', sku: 'A#red#M', payload: { qty: 1, price: 10 }, client_ts: 1, client_seq: 1, device_id: 'D1', vector_clock: {} },
    ];
    const state = applyOperations(ops);
    expect(state).toHaveLength(1);
    expect(state[0].qty).toBe(1);
  });
  
  it('should merge concurrent adds', () => {
    const ops: CartOperation[] = [
      { op_type: 'ADD', sku: 'A', payload: { qty: 1 }, client_ts: 1, client_seq: 1, device_id: 'D1', vector_clock: {} },
      { op_type: 'ADD', sku: 'A', payload: { qty: 1 }, client_ts: 2, client_seq: 1, device_id: 'D2', vector_clock: {} },
    ];
    const state = applyOperations(ops);
    expect(state[0].qty).toBe(2);
  });
  
  it('should handle remove after add', () => {
    const ops: CartOperation[] = [
      { op_type: 'ADD', sku: 'A', payload: { qty: 1 }, client_ts: 1, client_seq: 1, device_id: 'D1', vector_clock: {} },
      { op_type: 'REMOVE', sku: 'A', payload: {}, client_ts: 2, client_seq: 2, device_id: 'D1', vector_clock: {} },
    ];
    const state = applyOperations(ops);
    expect(state).toHaveLength(0);
  });
});
```

### 9.2 集成测试场景

| 场景 | 设备A | 设备B | 预期结果 |
|------|-------|-------|---------|
| 并发添加 | Add A x1 | Add A x1 | A x2 |
| 添加+删除 | Add A | Remove A | 空购物车 |
| 离线编辑 | Add A (离线) | - | 上线后同步成功 |
| 队列满 | 50个操作 | - | 自动压缩,不丢失 |
| 后台恢复 | Add A → 后台 | Add B | 前台显示A+B |

---

## 十、架构师待确认问题

### 10.1 关键决策点

| 问题 | 选项 | 建议 |
|------|------|------|
| **SKU 格式** | A. `{product_id}#{color}#{size}`<br>B. 独立 SKU ID | 建议A: 无需修改现有数据结构 |
| **操作日志保留** | A. 30天<br>B. 90天<br>C. 永久 | 建议A: 平衡存储与调试需求 |
| **实时推送** | A. Supabase Realtime<br>B. 轮询(60s)<br>C. 混合 | 建议C: 优先Realtime,降级轮询 |
| **离线队列上限** | A. 50<br>B. 100<br>C. 无限制 | 建议A: 防止内存溢出 |
| **冲突策略** | A. 时间戳优先<br>B. 客户端优先<br>C. 累加优先 | 建议A: 确定性最强 |

### 10.2 性能指标

| 指标 | 目标值 | 测试方法 |
|------|--------|---------|
| 操作同步延迟 | < 2s | 模拟双设备并发 |
| 状态计算时间 | < 50ms (100个操作) | Benchmark |
| IndexedDB 写入 | < 10ms | Performance API |
| 离线恢复时间 | < 1s | 断网重连测试 |

---

## 十一、附录

### 11.1 完整数据库迁移

```sql
-- 231_cart_operations.sql
-- 购物车操作日志系统 (v2.0)

-- 1. 操作日志表
CREATE TABLE cart_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('ADD', 'REMOVE', 'UPDATE_QTY', 'SELECT', 'DESELECT', 'CLEAR')),
  sku TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  client_ts BIGINT NOT NULL,
  client_seq INTEGER NOT NULL,
  vector_clock JSONB NOT NULL DEFAULT '{}',
  server_ts TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  acked BOOLEAN DEFAULT FALSE,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  
  UNIQUE(user_id, device_id, client_seq)
);

-- 2. 快照表 (只读缓存)
CREATE TABLE cart_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  selected_skus TEXT[] DEFAULT '{}',
  last_op_id UUID REFERENCES cart_operations(id),
  last_op_ts BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 3. 索引
CREATE INDEX idx_cart_ops_user ON cart_operations(user_id);
CREATE INDEX idx_cart_ops_user_device ON cart_operations(user_id, device_id);
CREATE INDEX idx_cart_ops_timestamp ON cart_operations(user_id, client_ts DESC);
CREATE INDEX idx_cart_ops_unsynced ON cart_operations(user_id, synced) WHERE synced = FALSE;
CREATE INDEX idx_cart_ops_expires ON cart_operations(expires_at);
CREATE INDEX idx_cart_snapshots_user ON cart_snapshots(user_id);

-- 4. RLS
ALTER TABLE cart_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY cart_ops_select_own ON cart_operations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_ops_insert_own ON cart_operations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_snapshots_select_own ON cart_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cart_snapshots_insert_own ON cart_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cart_snapshots_update_own ON cart_snapshots FOR UPDATE USING (auth.uid() = user_id);

-- 5. 自动清理过期操作
CREATE OR REPLACE FUNCTION cleanup_expired_cart_ops()
RETURNS void AS $$
BEGIN
  DELETE FROM cart_operations WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 6. 注释
COMMENT ON TABLE cart_operations IS '购物车操作日志 (CRDT-lite), 30天过期';
COMMENT ON COLUMN cart_operations.sku IS 'SKU格式: product_id#color#size';
COMMENT ON COLUMN cart_operations.vector_clock IS '向量时钟,用于冲突检测';
```

### 11.2 术语表

| 术语 | 解释 |
|------|------|
| **CRDT** | Conflict-free Replicated Data Type, 无冲突复制数据类型 |
| **OpLog** | Operation Log, 操作日志 |
| **Vector Clock** | 向量时钟,分布式系统逻辑时间戳 |
| **SKU** | Stock Keeping Unit, 库存单位 |
| **Optimistic UI** | 乐观UI,先更新界面再同步服务器 |
| **LWW** | Last Write Wins, 最后写入胜出 |

---

*文档结束 - 待架构师最终确认*
