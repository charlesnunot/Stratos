# 卖家收款资格状态机定义

## 状态机概述

`seller_payout_eligibility` 是平台计算的卖家收款资格状态，这是业务逻辑的唯一真源。

## 状态定义（铁律）

| 状态 | 含义 | 是否允许创建支付 |
|------|------|------------------|
| `eligible` | 平台明确允许卖家收款 | ✅ |
| `pending_review` | 状态不完整 / 等待 webhook / 人工审核 | ❌ |
| `blocked` | 明确禁止（风控 / 违规 / 订阅失效） | ❌ |

### 状态语义铁律

**除 `eligible` 以外，一律视为不可收款。**

- 不会出现"pending 先让过一下"的情况
- `validateSellerPaymentReady` 永远是三态判断，不模糊
- 状态不确定时采用"保守拒绝"策略，视为不可收款

## 必须触发重新计算的事件清单

**所有影响"是否允许收款"的事件，不得直接写 `seller_payout_eligibility`，只能触发重新计算。**

### 1. 卖家订阅状态变化

- ✅ 订阅开通
- ✅ 订阅过期
- ✅ 订阅取消
- ✅ 订阅降级/升级

**实现位置：**
- `src/lib/payments/process-subscription-payment.ts` - 订阅支付成功后
- 订阅过期检查（cron job）

### 2. 支付账户 onboarding 完成 / 更新

- ✅ Stripe Connect onboarding 完成
- ✅ PayPal 账户绑定完成
- ✅ 支付宝/微信账户绑定完成
- ✅ 账户信息更新

**实现位置：**
- `src/app/api/payments/stripe/connect/callback/route.ts` - Stripe Connect 回调
- 其他支付方式的回调处理

### 3. 支付机构 Webhook 事件

- ✅ Stripe: `account.updated`（charges_enabled / payouts_enabled 变化）
- ✅ Stripe: `account.application.deauthorized`（账户被禁用）
- ✅ PayPal: 账户状态变更事件
- ✅ 其他支付机构的账户状态变更

**实现位置：**
- `src/app/api/payments/stripe/webhook/route.ts` - Stripe webhook 处理

### 4. 风控规则命中 / 解除

- ✅ 风控系统标记卖家为高风险
- ✅ 风控系统解除标记
- ✅ 违规行为触发封禁
- ✅ 封禁解除

**实现位置：**
- 风控系统集成点（待实现）

### 5. 管理后台人工操作

- ✅ 管理员封禁卖家
- ✅ 管理员解封卖家
- ✅ 管理员修改账户状态

**实现位置：**
- 管理后台 API（待实现）

## UX 分界原则

### ❌ 不允许创建订单的情况（第一次校验失败）

**触发时机：** `src/app/api/orders/create/route.ts`

**失败原因：**
- 卖家订阅无效（未订阅或已过期）
- 从未绑定收款账户（payment_provider 或 payment_account_id 为空）
- seller_payout_eligibility ≠ eligible（包括 blocked 和 pending_review）

**处理方式：**
- 直接拒绝，不创建订单
- 返回明确错误信息
- 引导卖家完成必要步骤（订阅/绑定账户）
- **不允许用户"等等再付"**（因为订单根本不存在）

### ✅ 允许有订单但不允许付款的情况（第二次校验失败）

**触发时机：** 所有支付创建 API
- `src/app/api/payments/stripe/create-order-checkout-session/route.ts`
- `src/app/api/payments/paypal/create-order/route.ts`
- `src/app/api/payments/alipay/create-order/route.ts`
- `src/app/api/payments/wechat/create-order/route.ts`

**失败原因：**
- 账户刚被冻结（下单后到支付前被风控）
- Webhook 未同步完成（状态更新延迟）
- 风控临时拦截（临时性风控规则触发）
- 订阅在支付前过期（下单时有效，支付时已过期）

**处理方式：**
- 订单已存在，状态保持为 `pending`
- 返回错误信息，说明原因
- **允许用户"等等再付"**（等待状态恢复后重试）
- 提供自动重试机制（可选）
- 客服话术：解释为"临时状态问题，稍后重试"

## 实现细节

### 计算函数

**文件：** `src/lib/payments/calculate-seller-payout-eligibility.ts`

**数据库函数：** `calculate_seller_payout_eligibility(p_seller_id UUID)`

**计算逻辑：**
1. 检查订阅是否有效
2. 检查支付账户是否绑定
3. 检查支付机构账户状态（provider_* 字段）
4. 检查风控规则
5. 综合判断返回 `seller_payout_eligibility`

### 更新服务（物理锁）

**文件：** `src/lib/payments/update-seller-payout-eligibility.ts`

**数据库函数：** `update_seller_payout_eligibility(p_seller_id UUID)`

**铁律：** 任何 API / cron / webhook 不允许直接 UPDATE `seller_payout_eligibility`，只能通过此服务写入。

### 验证函数

**文件：** `src/lib/payments/validate-seller-payment-ready.ts`

**验证项：**
1. 卖家是否存在
2. 卖家订阅是否有效
3. 是否绑定了收款账户
4. seller_payout_eligibility = 'eligible'（唯一真源）

## 异步最终一致性

**原则：** Webhook 不保证即时改变卖家状态，只保证最终一致。

**流程：**
1. Stripe webhook 到达 → 更新 provider_* 字段
2. 触发重新计算 eligibility（异步）
3. 在状态同步完成之前，第二次校验依然兜底
4. **保守拒绝策略**：状态不确定时视为不可收款，宁可失败，不可错放

## 状态快照（审计和申诉）

**字段位置：** `orders` 表
- `seller_payout_eligibility_at_order_creation`
- `seller_payment_provider_snapshot`
- `seller_payment_account_id_snapshot`

**目的：**
- 审计：记录下单时的真实状态
- 申诉：卖家可以证明"下单时明明可以卖"
- 风控回溯：分析状态变化的时间线

**原则：**
- 判断永远用最新状态（`profiles.seller_payout_eligibility`）
- 记录用当时快照（`orders.seller_payout_eligibility_at_order_creation`）
