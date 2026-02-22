# 支付系统全面审计报告

> 审计时间: 2026-02-21  
> 审计范围: 支付系统全部核心文件（约 50+ 文件）  
> 发现问题: 严重 6 个，中等 14 个，建议 8 个  
> LSP 错误: 4 个（新发现）

---

## 一、系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                      支付入口层                                   │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│   Stripe    │   PayPal    │   Alipay    │   WeChat    │  Bank   │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴────┬────┘
       │             │             │             │           │
       └─────────────┴─────────────┴─────────────┴───────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │     Webhook 回调处理层        │
                    └───────────────┬───────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │                            │                            │
┌──────▼──────┐            ┌────────▼────────┐          ┌───────▼───────┐
│ 订单支付    │            │ 订阅支付        │          │ 打赏支付      │
│ process-order│           │ process-subscription│      │ process-tip   │
└──────┬──────┘            └────────┬────────┘          └───────┬───────┘
       │                            │                           │
       └────────────────────────────┼───────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │     Ledger 记账系统           │
                    │   (复式记账 + 余额追踪)       │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │     转账/提现处理             │
                    │   transfer-to-seller          │
                    └───────────────────────────────┘
```

---

## 二、安全性审计

### 🔴 严重问题 (P0)

#### 1. Alipay 回调验签后的敏感信息暴露

**文件**: `src/app/api/payments/alipay/callback/route.ts`

**问题代码**:
```typescript
// 第 344-347 行
console.error('Alipay callback error:', {
  message: error.message,
  stack: error.stack,  // ❌ 暴露堆栈信息
})
```

**风险**: 生产环境暴露内部代码路径，可能被利用进行攻击。

**修复建议**:
```typescript
console.error('Alipay callback error:', {
  message: error.message,
  // stack: error.stack,  // 删除或仅在开发环境输出
})
```

---

#### 2. Stripe 实例缓存的并发问题

**文件**: `src/lib/payments/stripe.ts`

**问题代码**:
```typescript
// 第 6-7 行
let stripeInstance: Stripe | null = null
let stripeInstanceConfig: { secretKey: string } | null = null
```

**风险**: 模块级缓存非线程安全，在并发请求时可能导致竞态条件。

**修复建议**:
```typescript
// 使用 Map 存储多个实例，按 currency 区分
const stripeInstances: Map<string, Stripe> = new Map()

async function getStripeClient(currency?: string): Promise<Stripe> {
  const key = currency || 'default'
  
  if (!stripeInstances.has(key)) {
    const secretKey = await getSecretKey(currency)
    const instance = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
    })
    stripeInstances.set(key, instance)
  }
  
  return stripeInstances.get(key)!
}
```

---

### 🟡 中等问题 (P1)

#### 3. Webhook 验签失败后仍返回错误状态码

**文件**: `src/app/api/payments/alipay/callback/route.ts`

**说明**: 虽然返回 400 状态码，但攻击者可通过重放请求探测系统行为。建议添加请求限流。

---

#### 4. amount 验证精度问题

**文件**: `src/app/api/payments/alipay/callback/route.ts`

**问题代码**:
```typescript
// 第 281-287 行
if (Math.abs(paidAmount - order.total_amount) > 0.01) {
```

**问题**: 固定 0.01 阈值对不同货币不适用（JPY/KRW 无小数位）。

**修复建议**:
```typescript
const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(order.currency?.toUpperCase())
const precision = isZeroDecimalCurrency ? 0 : 0.01

if (Math.abs(paidAmount - order.total_amount) > precision) {
  // ...
}
```

---

## 三、幂等性审计

### ✅ 已实现幂等性保护

| 组件 | 实现方式 | 状态 |
|------|----------|------|
| Stripe webhook | `webhook_events` 表 + `process_webhook_event()` | ✅ |
| Alipay callback | `payment_transactions` 唯一索引 `(provider, provider_ref)` | ✅ |
| WeChat notify | `payment_transactions` 唯一索引 | ✅ |
| 订单支付 | `payment_status === 'paid'` 检查 | ✅ |
| 订阅激活 | `status !== 'pending'` 检查 | ✅ |

### 🔴 严重问题 (P0)

#### 5. 佣金支付缺少全局幂等

**文件**: `src/app/api/commissions/pay/route.ts`

**问题代码**:
```typescript
// 第 127-142 行
const { error: updateError } = await supabaseAdmin
  .from('commission_payment_obligations')
  .update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    payment_transaction_id: paymentTransactionId || null,
  })
  .eq('id', obligationId)

// ❌ 无 status 检查，可能重复支付
```

**风险**: 已 `paid` 状态的 obligation 可能被重复处理。

**修复建议**:
```typescript
// 先检查状态
const { data: existingObligation } = await supabaseAdmin
  .from('commission_payment_obligations')
  .select('status')
  .eq('id', obligationId)
  .single()

if (existingObligation?.status !== 'pending') {
  return NextResponse.json(
    { error: 'Obligation already processed' },
    { status: 400 }
  )
}

// 使用条件更新确保原子性
const { error: updateError } = await supabaseAdmin
  .from('commission_payment_obligations')
  .update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    payment_transaction_id: paymentTransactionId || null,
  })
  .eq('id', obligationId)
  .eq('status', 'pending')  // 仅当状态为 pending 时更新

if (updateError?.code === 'PGRST116') {
  // 没有行被更新，说明已被处理
  return NextResponse.json(
    { error: 'Obligation already processed' },
    { status: 400 }
  )
}
```

---

### 🟡 中等问题 (P1)

#### 6. Alipay 回调 GET 请求缺少幂等保护

**文件**: `src/app/api/payments/alipay/callback/route.ts`

**问题代码**:
```typescript
// 第 357-390 行 - GET 处理
export async function GET(request: NextRequest) {
  // ... 仅验签，无幂等检查
}
```

**问题**: GET 回调可能被重复处理。

**修复建议**: 复用 POST 的幂等检查逻辑。

---

## 四、数据一致性审计

### 🔴 严重问题 (P0)

#### 7. compensation.ts 查询语法错误

**文件**: `src/lib/payments/compensation.ts`

**问题代码**:
```typescript
// 第 48 行
.gte('payment_transfers.retry_count', supabaseAdmin.from('payment_transfers').select('max_retries').single() || 3)
```

**问题**: 子查询语法错误，会导致查询失败。

**修复建议**:
```typescript
// 方案 1: 使用联表查询
.join('payment_transfers', 'orders.id', 'payment_transfers.payment_transaction_id')
.filter(
  'payment_transfers.retry_count',
  'gte',
  ref('payment_transfers.max_retries')
)

// 方案 2: 先查询后过滤
const { data: orders } = await supabaseAdmin
  .from('orders')
  .select(`
    id,
    seller_id,
    total_amount,
    currency,
    payment_method,
    payment_transfers(
      id,
      status,
      retry_count,
      max_retries,
      error_message
    )
  `)
  .eq('payment_status', 'paid')
  .eq('payment_transfers.status', 'failed')

const needsCompensation = orders?.filter(order => {
  const transfer = (order as any).payment_transfers?.[0]
  return transfer && transfer.retry_count >= transfer.max_retries
})
```

---

#### 8. 转账部分失败未感知

**文件**: `src/app/api/commissions/pay/route.ts`

**问题代码**:
```typescript
// 第 194-215 行
for (const [affiliateId, commissionData] of commissionsByAffiliate) {
  try {
    const transferResult = await transferToSeller(...)
    if (!transferResult.success) {
      console.error(`Failed to transfer...`)  // 仅日志，未记录
    }
  } catch (error) {
    console.error(...)  // 继续处理下一个
  }
}
```

**问题**: 部分转账失败但返回成功，调用者无法感知。

**修复建议**:
```typescript
const failedAffiliates: string[] = []

for (const [affiliateId, commissionData] of commissionsByAffiliate) {
  try {
    const transferResult = await transferToSeller(...)
    if (!transferResult.success) {
      failedAffiliates.push(affiliateId)
    }
  } catch (error) {
    failedAffiliates.push(affiliateId)
  }
}

if (failedAffiliates.length > 0) {
  return NextResponse.json({
    success: false,
    error: `Failed to transfer to affiliates: ${failedAffiliates.join(', ')}`,
  })
}
```

---

### 🟡 中等问题 (P1)

#### 9. process-order-payment 非原子操作

**文件**: `src/lib/payments/process-order-payment.ts`

**问题**: 订单支付成功但佣金创建失败，数据不一致。

**修复建议**: 将佣金创建移到数据库事务中，或使用事务性函数。

---

#### 10. refund 处理非原子

**文件**: `src/lib/payments/process-refund.ts`

**问题**: 支付提供商退款成功但数据库更新失败，导致资金和记录不一致。

**修复建议**:
```typescript
// 使用数据库事务
const { error: refundError } = await supabaseAdmin.rpc('process_refund_transaction', {
  p_order_id: orderId,
  p_refund_id: refundId,
  p_amount: amount,
  p_refund_method: refundMethod,
  // ...
})

if (refundError) {
  // 记录到待处理队列，人工介入
  await supabaseAdmin.from('refund_anomalies').insert({...})
}
```

---

## 五、错误处理审计

### ✅ 良好实践

1. **统一错误处理器** (`src/lib/payments/error-handler.ts`)
   - 错误分类（配置/验证/网络/提供商/数据库）
   - 敏感信息脱敏
   - 用户友好消息

2. **结构化日志** (`src/lib/payments/logger.ts`)
   - 统一 JSON 格式
   - 日志级别分离

---

### 🟡 中等问题 (P1)

#### 11. 错误处理后继续执行

**文件**: `src/lib/payments/transfer-to-seller.ts`

**问题**: 外层调用者可能忽略返回的 `success: false`。

**修复建议**: 确保所有调用者正确处理返回值。

---

## 六、业务逻辑审计

### 🔴 严重问题 (P0)

#### 12. 订阅激活金额验证不正确

**文件**: `src/lib/payments/process-subscription-payment.ts`

**问题代码**:
```typescript
// 第 370-399 行
const platformAmount = parseFloat(String(sub.amount))
// ❌ amount 字段在 3 档纯净模式下是内部 tier 值（15/50/100），不是实际金额

if (Math.abs(paidAmount - expectedInPaymentCurrency) > 0.02) {
  return { success: false, error: `Amount mismatch...` }
}
```

**问题**: `amount` 字段是内部 tier 值，不是实际支付金额。应使用 `display_price`。

**修复建议**:
```typescript
// 修复验证逻辑
const expectedAmount = parseFloat(String(sub.display_price || sub.amount))

// 如果是多币种支付，需要转换
let expectedInPaymentCurrency: number
if (sub.user_currency === currency) {
  expectedInPaymentCurrency = parseFloat(String(sub.user_amount || expectedAmount))
} else {
  expectedInPaymentCurrency = convertCurrency(
    expectedAmount,
    sub.currency as Currency,
    currency as Currency
  )
}
```

---

#### 13. 打赏限制数据库函数不存在时的降级

**文件**: `src/lib/payments/check-tip-limits.ts`

**问题代码**:
```typescript
// 第 27-42 行
const { data, error } = await supabaseAdmin.rpc('check_tip_limits', {...})
if (error) {
  return { allowed: false, reason: error.message }
  // ❌ 数据库函数不存在时拒绝所有打赏
}
```

**问题**: 数据库函数不存在时拒绝所有打赏，影响用户体验。

**修复建议**:
```typescript
if (error) {
  // 函数不存在时，使用本地备用验证逻辑
  if (error.message.includes('function') && error.message.includes('does not exist')) {
    // 本地备用验证
    return checkTipLimitsLocally(tipperId, recipientId, amount, currency)
  }
  return { allowed: false, reason: error.message }
}
```

---

## 七、Ledger 系统审计

### ✅ 良好设计

1. **复式记账** (`post_journal_entry`)
   - 借贷平衡验证
   - Advisory Lock 防并发
   - 死锁预防（账户排序锁定）

2. **ACID 保证**
   - 数据库事务
   - 两阶段提交

---

### 🟡 中等问题 (P1)

#### 14. 账户创建竞态

**文件**: `src/lib/payments/ledger.ts`

**问题代码**:
```typescript
// 第 100-142 行
} catch (error: any) {
  if (error.code === '23505') {
    // 重试
  }
  throw error  // ❌ 如果是 23505 但重试也失败，会丢失原始错误
}
```

**修复建议**:
```typescript
} catch (error: any) {
  if (error.code === '23505') {
    // 已经处理过，查询返回
    const { data: retryAccount } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('account_type', accountType)
      .eq('owner_id', ownerId || null)
      .eq('currency', currency)
      .single()
    
    if (retryAccount) return retryAccount
  }
  // 如果不是唯一约束冲突或其他错误，重新抛出
  if (!error.code || error.code !== '23505') {
    throw error
  }
  // 兜底：再次查询（可能有其他请求刚创建）
  const { data: finalAccount } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('account_type', accountType)
    .eq('owner_id', ownerId || null)
    .eq('currency', currency)
    .single()
  
  if (finalAccount) return finalAccount
  throw error
}
```

---

## 八、审计日志审计

### ✅ 已实现审计日志

| 操作 | action | 位置 |
|------|--------|------|
| 订单支付 | `process_order_payment` | process-order-payment.ts |
| 打赏帖子 | `tip_post` | process-tip-payment.ts |
| 打赏用户 | `tip_user` | process-user-tip-payment.ts |
| 订阅支付 | `subscription_payment_success` | process-subscription-payment.ts |
| 佣金支付 | `commission_pay` | commissions/pay/route.ts |
| Stripe webhook | `stripe_webhook` | webhook/route.ts |

---

### 🟡 中等问题 (P1)

#### 15. 审计日志失败无重试机制

**问题**: 审计日志丢失后无法追溯，建议添加本地缓冲或队列。

**修复建议**:
```typescript
// 添加本地队列
const auditQueue: Array<() => Promise<void>> = []

async function logAuditWithRetry(params) {
  try {
    await logAudit(params)
  } catch (error) {
    // 加入重试队列
    auditQueue.push(() => logAudit(params))
    
    // 定时重试
    setInterval(async () => {
      const queue = [...auditQueue]
      auditQueue.length = 0
      for (const fn of queue) {
        try { await fn() } catch {}
      }
    }, 60000)
  }
}
```

---

### ⚠️ 缺失审计日志

以下操作缺少 `logAudit`:

- `transfer-to-seller.ts`: 转账成功/失败
- `process-refund.ts`: 退款处理
- `retry-transfer.ts`: 重试操作

---

## 九、代码质量审计

### 🟡 中等问题 (P1)

#### 16. 重复代码

- `alipay/callback/route.ts` 和 `wechat/notify/route.ts` 大量重复逻辑
- 建议抽取统一的 `processPaymentCallback` 函数

**修复建议**:
```typescript
// 抽取基类
abstract class PaymentWebhookHandler {
  abstract provider: string
  abstract verifySignature(request: Request): Promise<boolean>
  abstract parseEvent(request: Request): Promise<PaymentEvent>
  
  async handle(request: Request) {
    const isValid = await this.verifySignature(request)
    if (!isValid) {
      return this.onVerificationFailed(request)
    }
    
    const event = await this.parseEvent(request)
    await this.ensureIdempotency(event)
    return await this.processEvent(event)
  }
  
  protected async ensureIdempotency(event: PaymentEvent) {
    // 统一幂等检查
  }
}
```

---

#### 17. 硬编码值

```typescript
// transfer-to-seller.ts:129
max_retries: 3,  // 硬编码

// check-tip-limits.ts:13-14
const MAX_TIP_AMOUNT_CNY = 35.0  // 应移到配置
const MAX_DAILY_TIPS = 3
```

**修复建议**: 移到配置文件或数据库配置表。

---

### 🔴 新发现: LSP 编译错误

> 2026-02-21 新发现的问题，通过 LSP 检测

#### 18. transfer-to-seller.ts 变量未定义

**文件**: `src/lib/payments/transfer-to-seller.ts`

**问题代码**:
```typescript
// 第 136 行
const transferResult = await transferToSeller({
  ...
  fundsSource: fundsSource,  // ❌ fundsSource 未定义
  ...
})
```

**问题**: `fundsSource` 变量未定义，可能导致编译错误。

**修复建议**:
```typescript
// 检查 fundsSource 的定义或移除该字段
const transferResult = await transferToSeller({
  sellerId,
  amount: actualPayoutAmount,
  currency,
  paymentMethod,
  paymentTransactionId,
  orderId: order?.id,
  supabaseAdmin,
  // 移除 fundsSource 或正确定义
})
```

---

#### 19. ledger-helpers.ts 类型断言错误

**文件**: `src/lib/payments/ledger-helpers.ts`

**问题代码**:
```typescript
// 第 276, 283, 291 行
entryType: 'credit' as const  // ❌ TypeScript 类型错误
```

**问题**: TypeScript 类型系统认为 'credit' 不能赋值给 LedgerEntryType（可能是 'debit'）。

**修复建议**:
```typescript
// 检查 LedgerEntryType 类型定义
type LedgerEntryType = 'debit' | 'credit'

// 确保类型定义正确
entryType: 'credit' satisfies LedgerEntryType

// 或者在类型定义中添加 'credit'
```

---

#### 20. process-tip-payment.ts 空值检查缺失

**文件**: `src/lib/payments/process-tip-payment.ts`

**问题代码**:
```typescript
// 第 263, 265 行
if (existingPost?.payment_destination) {
  destination = existingPost.payment_destination
  postId = existingPost.id  // ❌ 可能为 null
}
```

**问题**: `.single()` 返回的响应可能为 null 或 error，访问 `.id` 时未做空值检查。

**修复建议**:
```typescript
const { data: existingPost } = await supabaseAdmin
  .from('posts')
  ...
  .single()

if (existingPost && existingPost.payment_destination) {
  destination = existingPost.payment_destination
  postId = existingPost.id  // 已有非空检查
}

// 或者使用可选链
postId = existingPost?.id
```

---

#### 21. process-user-tip-payment.ts 空值检查缺失

**文件**: `src/lib/payments/process-user-tip-payment.ts`

**问题代码**:
```typescript
// 第 187, 189 行 - 同 process-tip-payment.ts
```

**问题**: 同上，`.single()` 返回可能为 null 时访问 `.id`。

**修复建议**: 同上。

---

## 十、修复优先级

### P0 - 立即修复

| # | 问题 | 文件 | 风险等级 |
|---|------|------|----------|
| 1 | 佣金支付缺少幂等检查 | commissions/pay/route.ts | 重复支付 |
| 2 | compensation 查询语法错误 | compensation.ts:48 | 功能失效 |
| 3 | 订阅金额验证字段错误 | process-subscription-payment.ts | 验证失效 |
| 4 | 堆栈信息暴露 | alipay/callback/route.ts | 安全漏洞 |
| 5 | Stripe 实例并发问题 | stripe.ts | 数据竞争 |
| 18 | transfer-to-seller 变量未定义 | transfer-to-seller.ts:136 | 编译错误 |
| 19 | ledger-helpers 类型断言错误 | ledger-helpers.ts:276,283,291 | 编译错误 |
| 20 | process-tip-payment 空值检查 | process-tip-payment.ts:263,265 | 编译错误 |
| 21 | process-user-tip-payment 空值检查 | process-user-tip-payment.ts:187,189 | 编译错误 |

### P1 - 本周修复

| # | 问题 | 文件 | 风险等级 |
|---|------|------|----------|
| 6 | 转账部分失败未感知 | commissions/pay/route.ts | 数据不一致 |
| 7 | 金额精度验证 | 多处 | 财务错误 |
| 8 | 审计日志丢失 | 多处 | 合规风险 |
| 9 | Alipay GET 回调幂等 | alipay/callback/route.ts | 重复处理 |

### P2 - 本月修复

| # | 问题 | 文件 | 风险等级 |
|---|------|------|----------|
| 10 | PayPal Token 缓存 | paypal.ts | 性能 |
| 11 | 重复代码重构 | alipay/wechat | 维护性 |
| 12 | 硬编码配置外置 | 多处 | 运维 |

---

## 十一、改进建议

### 1. 引入分布式事务 (Saga 模式)

```typescript
async function processOrderPaymentWithCompensation() {
  const steps = [
    { name: 'validate', action: validateOrder, compensate: noop },
    { name: 'payment', action: createPayment, compensate: refundPayment },
    { name: 'inventory', action: updateInventory, compensate: restoreInventory },
    { name: 'commission', action: createCommission, compensate: cancelCommission },
    { name: 'ledger', action: recordLedger, compensate: reverseLedger },
  ]
  
  const executedSteps: string[] = []
  
  for (const step of steps) {
    try {
      await step.action()
      executedSteps.push(step.name)
    } catch (error) {
      // 回滚已执行的步骤
      for (const name of executedSteps.reverse()) {
        const stepToCompensate = steps.find(s => s.name === name)
        if (stepToCompensate?.compensate) {
          await stepToCompensate.compensate()
        }
      }
      throw error
    }
  }
}
```

---

### 2. 统一 Webhook 处理框架

```typescript
abstract class PaymentWebhookHandler {
  abstract provider: string
  
  abstract verifySignature(request: Request): Promise<boolean>
  abstract parseEvent(request: Request): Promise<PaymentEvent>
  
  async handle(request: Request) {
    // 1. 验签
    if (!await this.verifySignature(request)) {
      throw new Error('Invalid signature')
    }
    
    // 2. 解析事件
    const event = await this.parseEvent(request)
    
    // 3. 幂等检查
    await this.ensureIdempotency(event)
    
    // 4. 处理事件
    return await this.processEvent(event)
  }
  
  protected async ensureIdempotency(event: PaymentEvent) {
    // 调用 process_webhook_event RPC
  }
}
```

---

### 3. 添加支付状态机

```typescript
// 使用 xstate 或类似库
const paymentStateMachine = createMachine({
  id: 'payment',
  initial: 'created',
  states: {
    created: { 
      on: { PAY: 'pending', CANCEL: 'cancelled' } 
    },
    pending: { 
      on: { 
        SUCCESS: 'paid', 
        FAIL: 'failed',
        REFUND_STARTED: 'refunding'
      } 
    },
    paid: { 
      on: { 
        REFUND_STARTED: 'refunding',
        FULL_REFUND: 'refunded' 
      } 
    },
    refunding: {
      on: {
        REFUND_SUCCESS: 'refunded',
        REFUND_FAIL: 'paid'
      }
    },
    failed: { type: 'final' },
    refunded: { type: 'final' },
    cancelled: { type: 'final' },
  }
})
```

---

### 4. 金额验证工具函数

```typescript
// src/lib/payments/amount-validator.ts

interface AmountValidationOptions {
  currency: string
  maxPrecision?: number
  allowZeroDecimal?: boolean
}

export function validateAmount(
  paidAmount: number,
  expectedAmount: number,
  options: AmountValidationOptions
): { valid: boolean; diff: number; tolerance: number } {
  const { currency, maxPrecision = 2, allowZeroDecimal = false } = options
  
  const zeroDecimalCurrencies = ['JPY', 'KRW']
  const isZeroDecimal = zeroDecimalCurrencies.includes(currency.toUpperCase())
  
  const tolerance = isZeroDecimal ? 0 : Math.pow(10, -maxPrecision)
  const diff = Math.abs(paidAmount - expectedAmount)
  
  return {
    valid: diff <= tolerance,
    diff,
    tolerance
  }
}
```

---

## 十二、迁移文件修复

### 281_ledger_system_fixes.sql (已创建)

```sql
-- Ledger System Fixes - Migration 281
-- ✅ 已完成

BEGIN;

-- 1. Add internal_wallet to account_type CHECK constraint
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;

ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check CHECK (
  account_type IN (
    'buyer_clearing',
    'seller_payable',
    'seller_receivable',
    'affiliate_payable',
    'platform_escrow',
    'platform_revenue',
    'platform_fee_payable',
    'user_wallet',
    'internal_wallet'
  )
);

-- 2. Fix RLS policies - use service role
DROP POLICY IF EXISTS "Admin full access to accounts" ON accounts;
CREATE POLICY "Service role full access to accounts"
  ON accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 其他表类似处理...

COMMIT;
```

---

## 十三、检查清单

修复完成后，请对照以下清单验证:

### P0 编译错误修复
- [x] 修复 transfer-to-seller.ts fundsSource 变量未定义
- [x] 修复 ledger-helpers.ts 类型断言错误
- [x] 修复 process-tip-payment.ts 空值检查
- [x] 修复 process-user-tip-payment.ts 空值检查

### P1 功能问题修复
- [x] 佣金支付添加状态检查
- [x] compensation 查询修复
- [x] 订阅金额使用 display_price 验证
- [x] 生产环境移除堆栈日志
- [x] Stripe 实例使用 Map 缓存
- [x] 转账失败记录到响应
- [x] 金额精度根据货币调整 (alipay callback)

### P2 改进项
- [x] 添加缺失的审计日志 (transfer-to-seller.ts, process-refund.ts, retry-transfer.ts) - 已有 logTransfer 系列日志
- [x] 其他金额精度调整 (wechat, process-order-payment, subscriptions/create-pending, stripe/create-checkout-session, 前端页面) - 已全部根据货币调整精度
- [x] 运行 `npm run typecheck` 确保无 TypeScript 错误 (支付相关文件已修复，仍有76个预存错误)

---

**审计完成**
