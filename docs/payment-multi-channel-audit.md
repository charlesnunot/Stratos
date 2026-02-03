# 支付与多通道财务 — 审计报告

**审计范围**：支付接口与订单关联、多通道支付、收款账户管理、异常处理与日志、安全与合规  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议；已修复项已落地。

---

## 1. 支付接口与订单关联

**页面与接口**：`/api/payments/*`、`/api/checkout/validate-product`。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 每笔支付对应正确的订单 | **通过**：Stripe create-order-checkout-session 校验 orderId 归属 buyer_id；Alipay/WeChat/PayPal create-order 校验 orderId 归属 buyer_id；回调/webhook 通过 out_trade_no/order_number 或 metadata.orderId 查单；processOrderPayment 按 orderId 处理。 | 通过 | 无。 |
| 支付金额与订单金额一致 | **已修复**：Stripe 使用 order.total_amount 创建 session；原 Alipay/WeChat/PayPal create-order 使用请求体 amount，可被篡改。已改为：订单支付时强制使用 order.total_amount，且校验请求 amount 与订单金额误差 ≤0.01 否则 400。 | ~~中~~ 已修复 | 无。 |
| 防止重复支付或伪造支付请求 | **通过**：创建支付前检查 payment_status !== 'paid'；回调/webhook 内 processOrderPayment 有已付幂等；payment_transactions 按 provider_ref 去重；Stripe webhook 无签名秘密时拒绝。 | 通过 | 无。 |

### 1.2 已实施修复（支付金额）

- **`src/app/api/payments/alipay/create-order/route.ts`**：取单后计算 orderTotalAmount = order.total_amount，校验 numericAmount 与 orderTotalAmount 误差 ≤0.01；createAlipayOrder 使用 orderTotalAmount。
- **`src/app/api/payments/wechat/create-order/route.ts`**：同上，orderTotalAmount 校验；createWeChatPayOrder 与 payment_transactions.insert 使用 orderTotalAmount。
- **`src/app/api/payments/paypal/create-order/route.ts`**：type === 'order' 时增加 orderTotalAmount 校验；createPayPalOrder 使用 orderTotalAmount。

---

## 2. 多通道支付

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 各支付渠道集成是否正确 | **通过**：Stripe 使用 checkout session + webhook 验签；Alipay 使用 createOrder + callback 验签；WeChat 使用 createOrder + notify 验签；PayPal 使用 create-order + capture 且校验 buyer；银行转账使用 init + upload-proof + approve-proof，订单归属与金额来自 DB。 | 通过 | 无。 |
| 支付成功、失败、取消逻辑一致 | **通过**：成功由回调/webhook 或 capture 调用 processOrderPayment；失败/取消不更新订单为 paid，无重复入账。 | 通过 | 无。 |
| 后端回调接口安全，防止被攻击或篡改 | **通过**：Stripe webhook 校验 stripe-signature，无秘密时返回 500 拒绝；Alipay callback 使用 verifyAlipayCallback(params)；WeChat notify 使用 verifyWeChatPayNotify(params)；PayPal capture 为前端发起且校验 order.buyer_id === user.id。 | 通过 | 无。 |

---

## 3. 收款账户管理

**接口**：`/api/payment-accounts`（GET/POST/PUT/DELETE）、`/api/payment-accounts/[id]`（GET/PUT/DELETE）、`/api/payment-accounts/[id]/set-default`。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能操作自己的收款账户 | **通过**：GET 列表 .eq('seller_id', user.id)；POST 插入 seller_id: user.id；GET/PUT/DELETE [id] 与 PUT/DELETE body id 均先查 account，校验 seller_id === user.id 否则 403；set-default 校验 account.seller_id === user.id。 | 通过 | 无。 |
| 设置默认账户逻辑正确 | **通过**：set-default 先将同类型其他账户 is_default 置 false，再将该账户置 true；POST/PUT 中 isDefault 时先对同类型去默认再设当前。 | 通过 | 无。 |
| 财务数据更新同步准确 | **通过**：收款账户与订单支付、佣金、提现等通过 payment_account_id / payment_provider 关联；processOrderPayment 等使用 DB 事务/RPC，无发现不同步。 | 通过 | 无。 |

---

## 4. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 支付失败或网络异常时订单状态是否正确回滚 | **通过**：支付创建仅写 pending，成功由回调/processOrderPayment 更新；失败/取消不调用 processOrderPayment，订单保持未付；processOrderPayment 内使用 RPC 原子更新。 | 通过 | 无。 |
| 异常支付或回调是否有日志记录 | **通过**：Stripe webhook、Alipay callback、WeChat notify 等有 logAudit（action、resourceId、eventType/out_trade_no 等）；签名失败、金额不一致等有 console.error。 | 通过 | 无。 |
| 日志中不泄露敏感信息 | **通过**：审计与错误日志仅记录 eventType、orderId、out_trade_no、trade_no、total_amount 等业务标识，不记录卡号、密码、完整 account_info 或支付凭证原文。 | 通过 | 无。 |

---

## 5. 安全性与合规

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| API 调用是否需要认证和授权 | **通过**：创建支付、收款账户、set-default、capture 等均 getUser()，未登录 401；订单相关校验 buyer_id === user.id 或 seller 权限。 | 通过 | 无。 |
| 防止重放攻击或 CSRF/请求伪造 | **通过**：回调/webhook 依赖第三方签名验证；前端发起的支付创建与 capture 依赖会话认证；关键操作无仅靠 GET 的变更。 | 通过 | 无。 |
| 支付流程符合 PCI 或当地支付规范 | **部分**：卡数据由 Stripe 处理，本系统不落库；支付宝/微信/ PayPal 由官方 SDK/回调处理。具体合规需结合收单方与当地要求做专项评估。 | 低 | 按需做 PCI/当地合规专项评估与文档。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 状态 |
|------|--------|----------|----------|------|
| 1 | 支付宝/微信/PayPal 订单金额来自请求体 | create-order 使用前端 amount，可篡改导致少付或不一致 | ~~中~~ | **已修复**：订单支付强制 order.total_amount，并校验请求金额误差 ≤0.01 |

---

## 7. 已采用的正确实践（无需修改）

- **Stripe**：create-order-checkout-session 使用 order.total_amount；webhook 多秘密尝试验签，无秘密则拒绝；幂等依赖 payment_transactions/provider_ref。
- **Alipay/WeChat 回调**：验签、金额与 order.total_amount 校验、幂等、processOrderPayment 统一入账。
- **PayPal capture**：校验 metadata.orderId 对应订单且 buyer_id === user.id，再 processOrderPayment；金额来自 PayPal 实际扣款，processOrderPayment 内再次校验金额。
- **收款账户**：所有写操作限定 seller_id = user.id；set-default 与同类型互斥逻辑正确。
- **processOrderPayment**：校验 amount 与 order.total_amount 误差 ≤0.01，已付则幂等返回成功，使用 RPC 原子更新。

---

## 8. 可选后续优化

- Stripe webhook 无配置秘密时返回 401 或 503（当前 500），便于监控区分“未配置”与“验签失败”。
- 收款账户 GET 返回的 account_info 若含密钥类字段，可做脱敏或仅返回必要展示字段，降低泄露风险。
- 对支付创建、回调成功/失败、收款账户变更等做统一审计字段与检索能力，便于对账与排查。
