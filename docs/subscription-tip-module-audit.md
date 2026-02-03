# 订阅与打赏模块审计报告（任务 29）

**审计目标**：确保订阅创建、支付、管理和打赏功能安全可靠、权限正确、数据一致，并防止重复扣费或越权操作。  
**审计日期**：2025-01-31  
**范围**：页面 `/main/subscription/seller`、`/main/subscription/affiliate`、`/main/subscription/tip`、`/subscription/manage`、`/subscription/success`；接口 `/api/subscriptions/create-pending`、`/api/subscriptions/create-payment`、`/api/subscriptions/history`、`/api/payments/stripe/create-checkout-session`（订阅）、打赏相关 API 及支付回调。

---

## 1. 订阅创建与支付

**页面与接口**：`/main/subscription/seller`、`/main/subscription/affiliate`、`/main/subscription/tip`；`/api/subscriptions/create-pending`、`/api/subscriptions/create-payment`；Stripe 订阅走 `/api/payments/stripe/create-checkout-session`（type=subscription）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 用户只能创建属于自己的订阅 | **通过**：create-pending 需登录，插入 `user_id: user.id`；create-payment 校验 `sub.user_id === user.id`；Stripe 会话需登录。 | 通过 | 无。 |
| 订阅金额与支付接口一致 | **通过**：create-pending 与 create-payment 金额由服务端 `getSubscriptionPrice` 计算；create-checkout-session 已用服务端价格创建会话，前端 amount 仅做误差≤0.01 校验（见既有修复）。 | 通过 | 无。 |
| 防止重复支付或异常扣费 | **通过**：create-payment 校验订阅 status=pending；同一订阅支付由 out_trade_no / Stripe session 唯一性保证；Webhook 按 provider_ref 幂等；processSubscriptionPayment 插入 23505 视为幂等。 | 通过 | 无。 |
| Stripe 订阅 metadata 使用请求体 userId | **问题**：create-checkout-session 将 `userId \|\| user.id` 写入 metadata，若前端传入他人 userId，Webhook 会为他人激活订阅（当前用户付款），存在越权绑定。 | **高** | **已修复**：订阅类型一律使用 `user.id`（effectiveUserId），忽略请求体 userId。 |
| 订阅创建/支付无审计日志 | **问题**：create-pending、create-payment 成功/失败未调用 logAudit，不利审计与排查。 | **低** | **已修复**：create-pending 成功与插入失败时调用 logAudit；create-payment 在创建支付订单前调用 logAudit（action: create_subscription_payment）。 |

---

## 2. 订阅管理与取消

**页面与接口**：`/subscription/manage`。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 用户只能管理自己的订阅 | **通过**：未登录重定向登录；订阅与历史均按 `user_id = user.id` 查询；history API 仅返回当前用户数据。 | 通过 | 无。 |
| 取消、续订逻辑正确 | **通过**：页面无“取消订阅”接口；续订为跳转至对应订阅页再次走创建/支付流程，权限与金额由 API 校验。 | 通过 | 无。 |
| 异常订阅状态处理安全 | **通过**：展示以 DB 的 subscriptions 与 profile 为准；过期/待激活状态展示正确，续费入口指向对应类型页。 | 通过 | 无。 |

---

## 3. 成功页与反馈

**页面**：`/subscription/success`。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 支付成功信息正确显示 | **通过**：成功页从 DB 拉取当前用户最近一条订阅（可按 type 过滤），展示类型、金额、到期时间；卖家订阅成功引导绑定收款账户。 | 通过 | 无。 |
| 数据与后台同步一致 | **通过**：数据来自 subscriptions 表，Webhook/回调写入后可见；页面对未找到订阅有重试与提示。 | 通过 | 无。 |
| 无敏感支付信息泄露 | **通过**：仅展示订阅类型、金额、到期时间，无卡号、token、支付流水号等。 | 通过 | 无。 |
| 成功页错误日志 | **问题**：检查订阅失败时直接 console.error，生产可能泄露内部信息。 | **低** | **已修复**：console.error 仅在 NODE_ENV === 'development' 时输出；catch 使用 error instanceof Error。 |

---

## 4. 权限与安全

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 后端接口严格校验用户身份 | **通过**：create-pending、create-payment、history、create-checkout-session 均需登录；create-payment 校验订阅归属。 | 通过 | 已加强：Stripe 订阅 metadata 强制为当前用户。 |
| 防止其他用户修改或查看他人订阅 | **通过**：所有查询与操作均按当前 user.id；无按 subscriptionId 修改他人订阅的接口。 | 通过 | 无。 |

---

## 5. 日志与异常处理

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 所有订阅创建、支付、取消操作有日志 | **部分→已加强**：create-pending 成功/插入失败、create-payment 发起支付已记 logAudit；Stripe 支付有 logPaymentCreation/logPaymentError。 | 低 | **已修复**：见 1.1。 |
| 异常操作可回滚或提示 | **通过**：create-payment 仅生成支付订单，实际入账由回调完成；回调失败不重复入账（幂等）。 | 通过 | 无。 |
| 日志中不泄露敏感信息 | **通过**：logAudit 不记录卡号、token、account_info；错误日志为 message/context。 | 通过 | **已加强**：订阅相关 API 与成功页的 console.error 仅开发环境输出。 |

---

## 6. 打赏功能（简要）

**页面与接口**：打赏入口（如帖子打赏按钮）；`/api/payments/stripe/create-tip-session`；Webhook/capture 调用 processTipPayment。

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 打赏权限与金额 | **通过**：create-tip-session 校验 tip 订阅、非本人、非拉黑、限额；金额与扣款以支付结果为据。 | 通过 | 无。 |
| 数据一致与幂等 | **通过**：processTipPayment 写入 tip_transactions 等；23505 视为幂等。 | 通过 | 无。 |

（打赏详细审计见既有 `docs/subscription-tip-management-audit.md`。）

---

## 7. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复状态 |
|------|--------|----------|----------|----------|
| 1 | Stripe 订阅 metadata 使用请求体 userId | Webhook 可能为他人激活订阅 | **高** | ✅ 已修复（强制 effectiveUserId = user.id） |
| 2 | 订阅创建/支付无审计日志 | create-pending/create-payment 未 logAudit | **低** | ✅ 已修复 |
| 3 | 生产环境错误日志 | 多处 console.error 直接输出 | **低** | ✅ 已修复（仅开发环境） |

---

## 8. 已采用的正确实践（无需修改）

- **create-pending**：校验 subscriptionType、tier、paymentMethod；金额由 getSubscriptionPrice 计算；插入 user_id 为当前用户。
- **create-payment**：校验 `sub.user_id === user.id`、status=pending；金额由 getSubscriptionPrice 计算。
- **create-checkout-session**：服务端价格计算、URL 校验、subscriptionTier 白名单；金额误差校验。
- **PayPal 订阅**：capture-order 使用 `user.id` 调用 processSubscriptionPayment，不信任 metadata.userId。
- **history**：仅返回当前用户订阅。
- **manage / success**：未登录重定向；数据按 user_id 拉取与展示。

---

## 9. 涉及文件与变更

| 类型 | 路径 | 变更摘要 |
|------|------|----------|
| API | `src/app/api/payments/stripe/create-checkout-session/route.ts` | 订阅 metadata 强制 userId=user.id；console.error 仅开发环境；catch error: unknown |
| API | `src/app/api/subscriptions/create-pending/route.ts` | logAudit 成功/失败；console.error 仅开发；catch error: unknown |
| API | `src/app/api/subscriptions/create-payment/route.ts` | logAudit 发起支付；catch e: unknown |
| API | `src/app/api/subscriptions/history/route.ts` | console.error 仅开发；catch error: unknown |
| 页面 | `src/app/[locale]/(main)/subscription/success/page.tsx` | console.error 仅开发；catch err: unknown |
| 页面 | `src/app/[locale]/(main)/subscription/seller/page.tsx` | console.error 仅开发；catch error: unknown |
| 页面 | `src/app/[locale]/(main)/subscription/affiliate/page.tsx` | 同上 |
| 页面 | `src/app/[locale]/(main)/subscription/tip/page.tsx` | 同上 |

---

**审计结论**：订阅与打赏模块在权限、金额校验、防重复支付与数据一致性上设计正确。**已修复** Stripe 订阅 metadata 越权风险、订阅创建/支付审计日志、以及生产环境错误日志泄露；修复后满足「安全可靠、权限正确、数据一致、可追踪、日志不泄密」的审计目标。
