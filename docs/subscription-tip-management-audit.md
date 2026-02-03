# 订阅与打赏管理 — 审计报告

**审计范围**：订阅创建/支付/管理、成功页、打赏功能及相关 API；权限、金额、防重复、数据一致与日志  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 订阅创建与支付

**页面与接口**：`/subscription/seller`、`/subscription/affiliate`、`/subscription/tip`；`/api/subscriptions/create-pending`、`/api/subscriptions/create-payment`；Stripe 订阅走 `/api/payments/stripe/create-checkout-session`（type=subscription）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户只能创建自己有权限的订阅 | **通过**：① create-pending 需登录（getUser），未登录 401；任意已登录用户可创建 seller/affiliate/tip 任一类型（无角色前置限制）。② create-payment 校验 `sub.user_id === user.id`，非本人 403。③ create-checkout-session（Stripe 订阅）需登录，metadata 中 userId 为当前用户。 | 通过 | 无。 |
| 支付金额和周期正确 | **部分**：① **create-pending**：金额由服务端 `getSubscriptionPrice(type, tier, currency)` 计算，不信任前端 amount（若传 amount 则校验与计算值误差 ≤0.01）；周期为 30 天（starts_at/expires_at）。② **create-payment**（支付宝/微信）：金额由服务端 `getSubscriptionPrice(sub.subscription_type, sub.subscription_tier, 'CNY')` 计算，不信任前端。③ **Stripe 订阅**：`create-checkout-session` **未**用服务端价格校验，直接使用请求中的 `amount` 创建会话；若前端被篡改，可传低金额（如 0.01）完成支付并获订阅，Webhook 按 Stripe 实际扣款金额写入订阅记录。 | **中** | 对 Stripe 订阅：在 create-checkout-session 中当 type=subscription 时，用 `getSubscriptionPrice(subscriptionType, subscriptionTier, currency)` 得到金额，以该金额创建会话；可允许前端传 amount 仅做展示校验（误差≤0.01），实际会话金额以服务端为准。 |
| 支付接口调用安全、可防止重复支付 | **通过**：① create-pending 仅创建 pending 记录，不扣款。② create-payment 校验订阅 status=pending，同一订阅支付由支付宝/微信 out_trade_no 或 Stripe session 唯一性保证；Webhook 侧按 provider_ref（session_id）查 payment_transactions 做幂等，重复事件不重复入账。③ processSubscriptionPayment 插入 subscriptions 时若 23505 视为幂等命中。 | 通过 | 无。 |

---

## 2. 订阅管理

**页面**：`/subscription/manage`。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户只能管理自己的订阅 | **通过**：未登录重定向登录（redirect 带 pathname）；订阅列表与当前订阅均按 `user_id = user.id` 查询（Supabase 与 /api/subscriptions/history）；history API 仅返回当前用户的订阅。 | 通过 | 无。 |
| 取消、续订操作权限校验 | **通过**：页面无“取消订阅”接口调用；续订为跳转至 `/subscription/seller` 等选档页，再次走创建/支付流程，权限与金额由对应 API 校验。 | 通过 | 无。 |
| 数据同步到后端状态一致 | **通过**：订阅状态以 DB 的 subscriptions 与 profile 同步（sync_profile_subscription_derived）为准；manage 页展示来自 subscriptions 与 profiles，history 来自 API。 | 通过 | 无。 |

---

## 3. 订阅成功与反馈

**页面**：`/subscription/success`。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 成功页面信息正确显示 | **通过**：成功页从 DB 拉取当前用户最近一条订阅（按 type 过滤可选），展示类型、金额、到期时间；卖家订阅成功后会检查收款账户并可选弹窗引导绑定。 | 通过 | 无。 |
| 防止非订阅用户访问成功页 | **通过**：未登录时 `router.push('/login')`；已登录时仅查询 `user_id = user.id` 的订阅，他人订阅不可见；无订阅时显示“未找到订阅记录”等提示，不暴露他人数据。 | 通过 | 无。 |

---

## 4. 打赏功能

**页面与接口**：帖子打赏入口（如 /post/[id] 打赏按钮）；`/api/payments/stripe/create-tip-session`；支付成功后 Webhook/capture 调用 processTipPayment。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户余额和权限校验 | **通过**：create-tip-session 校验打赏方有有效 tip 订阅（checkTipEnabled、status/expires_at）；不能给自己打赏；被拉黑 403；接收方 tip_enabled 且订阅有效；金额与限额由 checkTipLimits 校验；实际扣款由 Stripe 完成，不依赖本地“余额”字段。 | 通过 | 无。 |
| 打赏金额正确 | **通过**：金额由前端传入，create-tip-session 校验 numericAmount > 0；Stripe 会话使用该金额，Webhook 使用 Stripe 实际扣款金额；processTipPayment 使用支付回调提供的 amount，不信任前端二次传参。 | 通过 | 无。 |
| 数据写入后端一致 | **通过**：打赏成功后在 processTipPayment 中写入 tip_transactions、更新 posts.tip_amount、可选转账与通知；tip_transactions 插入若 23505 视为幂等。 | 通过 | 无。 |
| 异常操作是否回滚 | **部分**：processTipPayment 为顺序写 tip_transactions、更新 post、转账、通知；若某步失败返回 error，前面已写库不会自动回滚；依赖支付侧幂等（同一 payment 不重复 process）。建议：关键失败可记 logAudit，必要时人工核对。 | **低** | 可选：对 processTipPayment 关键失败（如 tip_transactions 插入失败）记录 logAudit；如有需要可对“已写 tip_transactions 但更新 post 失败”做补偿或告警。 |

---

## 5. 异常处理与日志

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 订阅或打赏异常操作是否有日志记录 | **部分**：① 支付库侧：logPaymentCreation、logPaymentError、logPaymentSuccess 等有结构化日志。② 订阅 create-pending/create-payment 异常时仅 console.error，**未**调用 logAudit。③ 打赏 create-tip-session 异常时 console.error，processTipPayment 使用 logPaymentError/logPaymentSuccess。 | **低** | 可选：create-pending 失败时、create-payment 失败/成功时、订阅 Webhook 处理失败时调用 logAudit（action、userId、resourceId、result），不记录金额明细；便于审计与排查。 |
| 日志中敏感信息是否安全 | **通过**：现有支付 logger 与 handleApiError 不记录完整卡号、密码、token；logAudit 不记录 account_info；错误日志为 message/context，未发现输出用户输入原文或支付详情。 | 通过 | 保持规范；新增日志继续不记录敏感字段。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | Stripe 订阅金额未服务端校验 | create-checkout-session 使用前端传入 amount，可被篡改为低金额 | **中** | type=subscription 时用 getSubscriptionPrice 计算金额并以此创建会话 |
| 2 | 订阅/打赏异常无统一审计日志 | create-pending/create-payment 等异常仅 console.error，无 logAudit | **低** | 可选：关键失败/成功调用 logAudit（action、userId、resourceId、result） |
| 3 | 打赏失败无回滚 | processTipPayment 顺序写库，某步失败不自动回滚 | **低** | 可选：关键失败 logAudit；必要时人工核对或补偿 |

---

## 7. 已采用的正确实践（无需修改）

- **create-pending**：校验 subscriptionType、tier、paymentMethod；金额由 getSubscriptionPrice 计算，前端 amount 仅做一致性校验；插入 user_id 为当前用户。
- **create-payment**：校验订阅归属（sub.user_id === user.id）、status=pending；金额由 getSubscriptionPrice 计算；支付宝/微信使用服务端生成的订单号与金额。
- **history**：仅返回当前用户订阅；manage 页未登录重定向、数据按 user_id 拉取。
- **success**：未登录重定向；仅展示当前用户订阅；卖家订阅成功引导绑定收款账户。
- **打赏**：create-tip-session 校验 tip 订阅、黑名单、帖子归属、限额；processTipPayment 幂等与金额以支付结果为据；支付 logger 与错误处理已存在。
- **Webhook**：Stripe 订阅按 provider_ref 幂等；processSubscriptionPayment 插入订阅 23505 视为幂等。

---

**审计结论**：订阅与打赏在权限、防重复支付、数据一致性及日志脱敏方面整体良好；**主要改进点**为 **Stripe 订阅创建会话时用服务端价格替代前端金额**（中），以及可选的 **订阅/打赏关键操作 logAudit** 与打赏失败审计（低）。建议优先在 create-checkout-session 中对 type=subscription 使用 getSubscriptionPrice 计算金额后再创建 Stripe 会话。

---

## 8. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | Stripe 订阅金额未服务端校验 | **已修复**：`/api/payments/stripe/create-checkout-session` 中，订阅类型必填 `subscriptionType`、卖家订阅必填并校验 `subscriptionTier`（SELLER_TIERS_USD）；使用 `getSubscriptionPrice(subscriptionType, subscriptionTier, currency)` 在服务端计算金额，以该金额创建 Stripe 会话；前端传入的 `amount` 改为可选，若传入则与服务端金额误差不得超过 0.01，否则返回 400，防止篡改。 |
