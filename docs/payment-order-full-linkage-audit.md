# 推演任务 20 — 支付与订单功能链路审计

**目标**：验证从购物车结账、支付、订单生成到库存、佣金、通知、Cron 后续处理的完整端到端链路，确保事务、权限、RLS 与数据一致性。  
**任务名称**：Payment & Order Full Linkage Test  
**审计日期**：2025-01-31

---

## 1. 功能入口与鉴权

| 类别 | 入口 | 鉴权 | 状态 |
|------|------|------|------|
| 购物车与结账 | 页面 /cart、/checkout；API /api/orders/create | useAuth；创建订单仅限登录用户 | ✅ |
| 支付会话 | create-order-checkout-session（Stripe 等） | 校验 order.buyer_id === user.id；订单未支付 | ✅ |
| 支付回调 | Webhook / 支付回调 | Stripe：constructEvent 校验签名；金额与订单对应 | ✅ |
| 发货 | /api/orders/[id]/ship | 校验 order.seller_id === user.id；订单 paid | ✅ |
| 确认收货 | /api/orders/[id]/confirm-receipt | 校验 order.buyer_id === user.id；订单 shipped | ✅ |
| 取消/纠纷 | /api/orders/[id]/cancel、/api/orders/[id]/dispute | 买家/卖家/admin；取消/纠纷按权限 | ✅ |

---

## 2. 典型链路验证

### 2.1 创建订单

| 步骤 | 实现 | 状态 |
|------|------|------|
| 前端收集购物车 items、地址、配送信息 | Checkout 页面调用 /api/orders/create | ✅ |
| 后端校验库存、价格、卖家支付就绪 | orders/create 拉取 products、validateSellerPaymentReady、库存与价格校验 | ✅ |
| 保证金 requirement | 在「支付会话创建」阶段校验（create-order-checkout-session 内 RPC check_deposit_and_execute_side_effects） | ✅ |
| 生成父订单 + 子订单、写入 orders | orders/create 按卖家分组、写入 order_groups + orders + order_items | ✅ |
| 通知卖家（order_pending_payment） | orders/create 内 notifications.insert，content_key: order_pending_payment | ✅ |

### 2.2 支付会话创建

| 步骤 | 实现 | 状态 |
|------|------|------|
| 调用 create-payment-session（Stripe/Alipay/WeChat/PayPal） | create-order-checkout-session、create-intent 等 | ✅ |
| 校验订单归属、未支付、保证金 | create-order-checkout-session 校验 buyer_id、已付检查、deposit RPC | ✅ |
| 返回支付会话 URL | 前端跳转至支付网关 | ✅ |

### 2.3 支付回调处理

| 步骤 | 实现 | 状态 |
|------|------|------|
| verify webhook / 校验签名 | Stripe：constructEvent(body, signature, secret)；无签名则 401 | ✅ |
| process-order-payment | process_order_payment_transaction RPC（订单状态 paid、库存扣减等） | ✅ |
| 更新订单状态 paid、扣减库存 | RPC 内原子完成 | ✅ |
| affiliate_id → calculateAndCreateCommissions | process-order-payment 内调用 calculateAndCreateCommissions | ✅ |
| 插入 notifications：买家、卖家 | order_paid、seller_new_order；content_key 与 content_params | ✅ |
| logAudit（action: process_order_payment） | process-order-payment 内 logAudit(action, userId, resourceId, result, meta) | ✅ |

### 2.4 发货处理

| 步骤 | 实现 | 状态 |
|------|------|------|
| 校验卖家身份、订单状态 paid | order.seller_id === user.id；payment_status/order_status === 'paid' | ✅ |
| 更新子订单/父订单状态 shipped、tracking | orders 表 update shipped_at、tracking_number、logistics_provider | ✅ |
| 通知买家 | notifications.insert，content_key: order_shipped | ✅ |
| logAudit（action: ship_order） | ship 路由内 logAudit(action: 'ship_order', userId, resourceId, result) | ✅ |

### 2.5 确认收货

| 步骤 | 实现 | 状态 |
|------|------|------|
| 校验 buyer_id、订单 shipped | order.buyer_id === user.id；order_status === 'shipped' | ✅ |
| 更新订单状态 completed、received_at | orders 表 update | ✅ |
| 可选恢复接单 | checkRecoveryOnOrderCompletion | ✅ |
| 通知卖家 | notifications.insert，content_key: order_confirmed，英文 title/content + content_params | ✅（已修复硬编码中文） |
| logAudit（action: confirm_receipt） | confirm-receipt 路由内 logAudit(action: 'confirm_receipt', userId, resourceId, meta) | ✅（已补充） |

### 2.6 订单取消/纠纷

| 步骤 | 实现 | 状态 |
|------|------|------|
| 校验订单所有者或卖家/admin | cancel：buyer/seller/admin；dispute：buyer 或 seller | ✅ |
| 更新订单/纠纷状态、发起退款（若已支付） | cancel 内 processRefund；dispute 内创建 order_disputes | ✅ |
| 通知买家、卖家 | cancel/dispute 内 notifications.insert | ✅ |
| logAudit（action: cancel/dispute） | cancel、dispute、dispute/respond 内 logAudit | ✅ |
| 纠纷通知国际化 | dispute：content_key dispute_created；dispute/respond：dispute_seller_responded，英文 title/content | ✅（已修复硬编码中文） |

### 2.7 Cron / 后续任务

| 任务 | 实现 | 状态 |
|------|------|------|
| send-order-expiry-reminders | RPC send_order_expiry_reminders → notifications | ✅ |
| cancel-expired-orders | RPC auto_cancel_expired_orders（取消、库存回滚、通知） | ✅ |
| send-shipping-reminders | RPC send_shipping_reminders | ✅ |
| check-shipping-timeout | RPC auto_create_shipping_dispute | ✅ |
| 各 Cron logAudit / cron_logs | 任务 18 已验证 | ✅ |

---

## 3. DB/事务与数据一致性

| 验证点 | 说明 | 状态 |
|--------|------|------|
| 订单状态、子订单状态一致 | process_order_payment_transaction RPC 内原子更新；父订单状态由 update_order_group_payment_status 等维护 | ✅ |
| 库存扣减正确 | RPC 内按子订单扣减 | ✅ |
| 佣金生成与 affiliate_id 正确关联 | calculateAndCreateCommissions(order, supabaseAdmin) | ✅ |
| notifications 与订单状态事件一致 | 创建/支付/发货/确认/取消/纠纷均有对应通知 | ✅ |
| 支付异常需回滚 | RPC 事务失败则整体回滚；processOrderPayment 校验金额与已付状态 | ✅ |

---

## 4. 支付安全

| 验证点 | 实现 | 状态 |
|--------|------|------|
| Webhook 校验签名 | Stripe：constructEvent(body, signature, secret)；多 secret 尝试；失败 401 | ✅ |
| 金额与订单对应 | processOrderPayment 内 Math.abs(amount - order.total_amount) <= 0.01 | ✅ |
| 不记录支付明文/敏感字段 | logAudit 仅 action、userId、resourceId、meta（无卡号、密钥） | ✅ |

---

## 5. 审计与日志

| 验证点 | 实现 | 状态 |
|--------|------|------|
| logAudit 记录操作类型、用户、订单、结果 | process_order_payment、ship_order、confirm_receipt、cancel、dispute_open、dispute_respond、stripe_webhook 等 | ✅ |
| 不记录支付明文或敏感字段 | meta 仅订单 ID 前缀、paymentMethod、hasAffiliate 等 | ✅ |

---

## 6. 交叉联动

| 联动 | 实现 | 状态 |
|------|------|------|
| 支付成功 → 扣库存 → calculateAndCreateCommissions → notifications → Cron | processOrderPayment：RPC 扣库存 → 佣金计算 → 买家/卖家通知；Cron 独立调度 | ✅ |
| 订单取消/退款 → 通知、库存回滚、佣金回退 | cancel 内 processRefund、notifications；RPC/业务内库存回滚与佣金处理 | ✅ |

---

## 7. 本次修复与变更（任务 20）

| 序号 | 问题 | 修复 |
|------|------|------|
| 1 | confirm-receipt 使用同步 params，Next 15 需 Promise | 改为 params: Promise<{ id: string }>，const { id: orderId } = await params；全路由使用 orderId。 |
| 2 | confirm-receipt 通知硬编码中文 | title/content 改为英文；content_key: order_confirmed，content_params: { orderNumber }；link 改为 /seller/orders/:id。 |
| 3 | confirm-receipt 缺少 logAudit（action: confirm_receipt） | 补充 logAudit(action: 'confirm_receipt', userId, resourceId, resourceType: 'order', result, meta: { orderNumber })。 |
| 4 | cancel 使用同步 params | 改为 params: Promise<{ id: string }>，const { id: orderId } = await params。 |
| 5 | dispute POST/GET 使用同步 params | 改为 Promise<{ id: string }>，await params，使用 orderId。 |
| 6 | dispute 通知硬编码中文 | title/content 改为英文；content_key: dispute_created，content_params: { orderIdPrefix }。 |
| 7 | dispute/respond 使用同步 params、通知硬编码中文 | params 改为 Promise 并 await；通知 title/content 改为英文，content_key: dispute_seller_responded，content_params: { action }；catch 使用 error: unknown。 |

---

## 8. 已采用的正确实践（无需修改）

- **订单创建**：按卖家分组、子订单 + order_items、库存与价格校验、validateSellerPaymentReady。
- **保证金**：在支付会话创建阶段通过 RPC check_deposit_and_execute_side_effects 校验，不满足可阻止支付。
- **支付处理**：process_order_payment_transaction RPC 原子更新订单与库存；processOrderPayment 内金额校验、已付幂等、佣金与通知。
- **发货/确认/取消/纠纷**：权限校验、状态校验、通知与 logAudit 完整；ship 已使用 Promise params。

---

**审计结论**：支付与订单从创建、支付会话、回调、发货、确认收货、取消与纠纷到 Cron 的端到端链路已按任务 20 要求验证；本次修复了 confirm-receipt、cancel、dispute、dispute/respond 的 params 类型（Next 15）、确认收货与纠纷相关通知的国际化以及 confirm_receipt 的 logAudit，满足全部验证点。
