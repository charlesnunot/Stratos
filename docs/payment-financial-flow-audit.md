# 支付与财务流程 — 系统性审计报告

**审计范围**：支付接口与前端流程、支付渠道、收款账户、财务操作、敏感信息保护  
**审计日期**：2025-01-31  
**结论**：按检查点逐项列出问题描述、风险等级与建议修复方案，便于追踪。

---

## 1. 支付接口与前端流程

### 1.1 页面与接口

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| `/main/checkout` 用户身份验证 | 通过 | - | 结账页为客户端组件，依赖 `useAuth()`；创建订单调用 `/api/orders/create`，该 API 使用 `supabase.auth.getUser()` 校验身份，未登录返回 401。 |
| `/main/orders/[id]/pay` 用户身份与订单归属 | 通过 | - | 支付页通过 `useQuery` 拉取订单时校验 `data.buyer_id !== user.id` 则抛错；创建支付会话调用 `/api/payments/stripe/create-order-checkout-session` 等，服务端再次校验 `orderOwner?.buyer_id !== user.id` 返回 403。 |
| 支付请求订单合法性 | 通过 | - | `create-order-checkout-session`：校验 order 存在、归属当前用户、未支付、有收货地址、卖家支付就绪；金额来自 DB 中 `order.total_amount`，非前端传入。 |
| 订单金额、商品信息是否可篡改 | 通过 | - | **订单创建**：`/api/orders/create` 从 DB 拉取 `products.price`，与请求中 `item.price` 比对（误差 ≤0.01），不一致则校验失败；总价由服务端按校验通过后的价格计算。**支付会话**：使用 `order.total_amount`（来自 DB），不信任前端金额。 |
| 支付回调（Webhook）签名校验 | 通过 | - | **Stripe**：`stripe/webhook` 使用 `Stripe.webhooks.constructEvent(body, signature, secret)` 校验 `stripe-signature`，无签名或全部 secret 验证失败则返回 400/401。**支付宝**：`alipay/callback` 使用 `verifyAlipayCallback(params)`（RSA-SHA256 验签）。**微信**：`wechat/notify` 使用 `verifyWeChatPayNotify(params)` 验签。 |

### 1.2 PayPal capture-order 订单归属校验

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| PayPal 订单支付完成后归属校验 | 缺失 | **中** | `paypal/capture-order` 在用户从 PayPal 回调后根据 `metadata.orderId`（来自 PayPal 的 custom_id）处理订单支付，**未校验该订单的 buyer_id 是否等于当前登录 user.id**。若用户 A 发起支付后，用户 B 用自己账号打开回调链接并调用 capture，可能将用户 B 的支付记到用户 A 的订单上。**建议**：在 `paymentType === 'order'` 分支中，根据 `metadata.orderId` 查询订单的 `buyer_id`，若 `buyer_id !== user.id` 则返回 403，并记录审计日志。 |

---

## 2. 支付渠道安全

### 2.1 API Key / Secret 存储

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| Stripe | 通过 | - | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` 仅在服务端使用（API 路由、lib）；前端仅使用 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（可公开）。 |
| PayPal | 通过 | - | `PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET` 在服务端使用；前端仅使用 `NEXT_PUBLIC_PAYPAL_CLIENT_ID`。 |
| 支付宝 | 通过 | - | `ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY` 仅在服务端（lib/payments/alipay）使用。 |
| 微信 | 通过 | - | `WECHAT_PAY_APP_ID`、`WECHAT_PAY_MCH_ID`、`WECHAT_PAY_API_KEY`、证书路径等仅在服务端使用。 |
| 银行 | 通过 | - | 银行相关逻辑在服务端，未发现密钥暴露在前端。 |

### 2.2 HTTPS 与回调防重放

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| HTTPS | 依赖部署 | 中 | 与认证审计一致：应用层未强制 HTTPS；生产环境应在反向代理/Vercel 强制 HTTPS，middleware 已支持生产环境 HTTP→HTTPS 重定向及 HSTS。 |
| Stripe Webhook 防重放 | 部分 | 低 | Stripe 事件 ID 唯一，代码中通过 `payment_transactions` 表按 `provider_ref`（session_id/capture_id 等）做幂等，重复回调不会重复入账。未发现对同一 event.id 的显式去重。**建议**：可选对 Stripe event.id 做一次记录/去重，进一步防止重放。 |
| 支付宝回调防重放 | 通过 | - | 支付宝 callback 中按 `trade_no` 查询 `payment_transactions`，已存在且已处理则直接返回成功（幂等）。 |
| 微信回调防重放 | 通过 | - | 微信 notify 中按 `transaction_id` 等查询 `payment_transactions`，已处理则返回成功（幂等）。 |

---

## 3. 收款账户与账户操作

### 3.1 /api/payment-accounts CRUD

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 仅能修改自己的收款账户 | 通过 | - | GET/PUT/DELETE 及 `[id]`、`set-default` 均先查 `payment_accounts`，校验 `seller_id === user.id`，否则返回 403「Not your account」。 |
| 设置默认账户权限 | 通过 | - | `set-default` 与 PUT 中 `isDefault` 均在确认账户归属当前用户后操作，仅影响当前用户的同类型账户。 |
| POST 创建账户是否需卖家权限 | 未强制 | **低** | POST 创建收款账户**未**调用 `checkSellerPermission`，任何已登录用户均可创建。若业务允许「先绑定账户、后开通卖家」则合理；若仅卖家可拥有收款账户，**建议**：在 POST 中与 GET/PUT/DELETE 一致，增加 `checkSellerPermission`，无权限则 403。 |
| 删除/修改操作是否有日志 | 无结构化审计日志 | **低** | 仅 `console.error` 在异常时输出；无成功时的结构化审计日志（谁、何时、对哪条账户做了更新/删除）。**建议**：对 PUT/DELETE 及 set-default 记录审计日志（userId、accountId、操作类型、时间），不记录 `account_info` 等敏感字段。 |

### 3.2 敏感字段返回

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 账户列表返回内容 | 注意 | 低 | GET 返回 `accounts` 含 `account_info`（可能含第三方 token/密钥）。**建议**：若 `account_info` 含高敏感内容，列表接口可只返回脱敏摘要，详情或编辑时再按需拉取并做权限校验。 |

---

## 4. 财务操作完整性

### 4.1 保证金、佣金、退款、欠款

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| `/api/admin/deposits/[lotId]/process-refund` | 通过 | - | 使用 `requireAdmin(request)`，仅管理员可调用。 |
| `/api/admin/refunds/process` | 通过 | - | 使用 `requireAdmin(request)`，仅管理员可处理退款。 |
| `/api/admin/commissions/[id]/settle` | 通过 | - | 使用 `requireAdmin(request)`，仅管理员可结算佣金。 |
| `/api/admin/seller-debts`、`[sellerId]` | 通过 | - | 使用 `requireAdmin(request)`。 |
| `/api/deposits/pay` | 通过 | - | 需登录；且通过 `checkSellerDepositRequirement` 校验当前用户是否需要缴纳保证金，逻辑与卖家身份一致。 |
| `/api/commissions/pay`（GET/POST） | 通过 | - | 需登录；GET 拉取 `seller_id === user.id` 的待付佣金；POST 处理付款时与卖家身份关联，未发现越权。 |
| `/api/orders/[id]/cancel` 退款 | 通过 | - | 校验订单归属（buyer 或 seller），且退款逻辑使用服务端订单与支付信息，不信任前端金额。 |

### 4.2 异常操作与审计日志

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 管理员财务操作日志 | 仅错误日志 | **低** | 上述 admin 接口在失败时有 `console.error`，成功路径无统一审计日志（操作人、资源 ID、操作类型、时间）。**建议**：对 admin 退款、保证金处理、佣金结算、欠款等成功/失败均记录结构化审计日志（userId、adminId、resourceId、action、result），便于追溯与合规。 |
| 支付回调处理日志 | 部分 | 低 | Stripe/支付宝/微信回调中有部分 `console.log`（如「already processed」）；失败有 `console.error`。**建议**：统一为结构化日志（不含卡号、密码等），并考虑将关键支付事件写入 DB 或日志服务，便于对账与排查。 |

---

## 5. 敏感信息保护

### 5.1 支付返回与账户信息

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 支付 API 返回 | 通过 | - | 创建支付会话等接口返回 URL 或 session_id，未返回密码、完整卡号、第三方 secret。 |
| 收款账户 API 返回 | 注意 | 低 | 返回的 `account_info` 可能含商户密钥或 token。**建议**：前端仅展示必要展示字段；若需存敏感信息，考虑加密存储或在返回前脱敏。 |
| 错误信息 | 通过 | - | 未发现将内部 ID、密钥或堆栈直接返回给前端；错误多为通用文案或可控 message。 |

### 5.2 日志中的敏感数据

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 支付/回调日志 | 未发现密码/卡号 | 通过 | 审计范围内未发现日志中打印密码、完整卡号或 token。 |
| 建议 | - | - | 规范：日志中不记录 request body 中的支付信息、卡号、CVV、account_info 全文；异常日志仅记录错误类型与资源 ID，不记录敏感字段。 |

---

## 6. 其他发现

### 6.1 get-available-payment-methods

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 身份与权限 | 通过 | - | 需登录；接收 `sellerIds` 或 `productIds`，返回这些卖家支持的支付方式交集，未发现越权。 |

### 6.2 订单创建与支付流程小结

| 环节 | 身份校验 | 金额/商品校验 | 备注 |
|------|----------|----------------|------|
| POST /api/orders/create | 是（getUser） | 是（DB 价格校验） | 总价服务端计算 |
| POST create-order-checkout-session | 是（getUser + buyer_id） | 是（order 来自 DB） | 金额用 order.total_amount |
| Stripe/支付宝/微信回调 | 签名校验 | 幂等 + 业务校验 | 防伪造、防重放 |
| PayPal capture-order | 是（getUser） | 缺订单归属校验 | 建议补 buyer_id 校验 |

---

## 7. 修复优先级汇总

| 优先级 | 检查点 | 风险等级 | 建议动作 |
|--------|--------|----------|----------|
| P1 | PayPal capture-order 未校验订单归属 | 中 | 按 metadata.orderId 查订单 buyer_id，若非当前 user.id 则 403 并记日志 |
| P2 | payment-accounts POST 未强制卖家权限 | 低 | 若业务要求仅卖家可创建，则增加 checkSellerPermission |
| P2 | 收款账户 PUT/DELETE/set-default 无审计日志 | 低 | 记录 userId、accountId、操作类型、时间（不记录 account_info） |
| P2 | 管理员财务操作无成功审计日志 | 低 | 退款/保证金/佣金/欠款等成功与失败均记录结构化日志 |
| P3 | Stripe webhook 对 event.id 去重 | 低 | 可选：记录已处理 event.id，拒绝重复 event.id |
| P3 | 支付回调统一结构化日志 | 低 | 关键支付事件写入统一格式日志或 DB，便于对账与审计 |

---

**审计结论**：支付与财务流程在身份校验、金额防篡改、Webhook 签名与幂等方面整体到位；主要改进点为 **PayPal capture-order 订单归属校验**（P1）、收款账户创建权限与审计日志（P2）、以及管理员财务操作与支付回调的审计日志（P2/P3）。按上表优先级逐项修复可进一步提升安全与可追溯性。

---

## 8. 修复计划执行状态（Cursor 修复计划）

| 优先级 | 修复点 | 状态 | 说明 |
|--------|--------|------|------|
| P1 | PayPal capture-order 订单归属校验 | ✅ 已实现 | `paypal/capture-order` 中按 metadata.orderId 查订单 buyer_id，若非 user.id 则 403 并 logAudit(result: 'forbidden') |
| P2 | 收款账户 POST 仅卖家可创建 | ✅ 已实现 | POST /api/payment-accounts 中增加 checkSellerPermission，无权限返回 403 |
| P2 | 收款账户 PUT/DELETE/set-default 审计日志 | ✅ 已实现 | route.ts、[id]/route.ts、set-default/route.ts 成功/失败均 logAudit(action, userId, resourceId, result)，不记录 account_info |
| P2 | 管理员财务操作日志 | ✅ 已实现 | admin/refunds/process、admin/deposits/[lotId]/process-refund、admin/commissions/[id]/settle 成功/失败均 logAudit(adminId, resourceId, action, result) |
| P3 | Stripe webhook event.id 去重 | ⏸️ 可选未实现 | 需单独表存储已处理 event.id；当前依赖 payment_transactions 按 provider_ref 幂等，重复回调不会重复入账；webhook 内已加注释说明 |
| P3 | 支付回调统一结构化日志 | ✅ 已实现 | Stripe webhook、支付宝 callback、微信 notify 在验签/状态通过后均调用 logAudit(provider, resourceId, meta)，不含卡号/密码等敏感字段 |
