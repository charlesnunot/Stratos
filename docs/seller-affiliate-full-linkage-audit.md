# 推演任务 22 — 卖家后台与带货功能链路审计

**目标**：验证卖家后台与带货（Affiliate）功能端到端链路，包括商品管理、订单处理、保证金、佣金、带货推广、通知与 Cron 后续处理，确保权限、RLS、事务、审计日志与数据一致性。  
**任务名称**：Seller & Affiliate Full Linkage Test  
**审计日期**：2025-01-31

---

## 1. 功能入口与鉴权

| 类别 | 入口 | 鉴权 | 状态 |
|------|------|------|------|
| 卖家后台 | 页面 /seller/products、/seller/orders、/seller/deposits、/seller/commissions | useSellerGuard、checkSellerPermission；RLS products/orders 等 | ✅ |
| 商品 CRUD | Supabase products insert/update/delete + RLS | seller_id = auth.uid() 或 admin/support | ✅ |
| 订单发货 | /api/orders/[id]/ship | checkSellerPermission + order.seller_id === user.id | ✅ |
| 收款账户 | /api/payment-accounts/* | checkSellerPermission | ✅ |
| 保证金 | /api/deposits/check、pay、[lotId]/request-refund | checkSellerPermission；request-refund 校验 lot.seller_id === user.id | ✅ |
| 佣金支付 | /api/commissions/pay | 登录用户；obligation.seller_id === user.id | ✅ |
| 带货 | /api/affiliate/posts/create | RPC check_subscription_status(affiliate) | ✅ |
| Admin 退款/结算 | /api/admin/deposits/[lotId]/process-refund、/api/admin/commissions/[id]/settle | requireAdmin | ✅ |

---

## 2. 典型链路验证

### 2.1 商品创建/编辑/删除

| 步骤 | 实现 | 状态 |
|------|------|------|
| 前端表单提交 → Supabase products insert/update/delete | seller/products/create、[id]/edit、products/page | ✅ |
| RLS 校验 seller_id = auth.uid() 或 admin/support | products 表 RLS 策略 | ✅ |
| logAudit（action: create/update/delete product） | create: create_product；edit: update_product；list 删除: delete_product | ✅ |
| product status/pending/active | 创建为 pending，审核通过后 active | ✅ |

### 2.2 订单发货

| 步骤 | 实现 | 状态 |
|------|------|------|
| checkSellerPermission + order.seller_id = user.id | ship 路由内校验 | ✅ |
| 验证订单状态 paid | payment_status/order_status === 'paid' | ✅ |
| 更新 order_status → shipped、tracking | orders 表 update | ✅ |
| 写通知 → 买家 | notifications content_key: order_shipped | ✅ |
| logAudit（action: ship_order） | ship 路由内 logAudit(action: 'ship_order', userId, resourceId, result) | ✅（任务 20 已确认） |

### 2.3 保证金支付/退款

| 步骤 | 实现 | 状态 |
|------|------|------|
| checkSellerPermission；request-refund 校验 lot.seller_id | deposits/check、pay、request-refund | ✅ |
| 支付成功 → update deposit lot status = paid | Webhook/回调内处理 | ✅ |
| 退款申请 → status = refunding | request-refund 内 update status = 'refunding' | ✅ |
| admin process-refund → status = refunded | process-deposit-refund 内 update + 通知 | ✅ |
| 写通知 → 卖家 | request-refund: deposit_refund_request；process-refund: deposit_refund_completed | ✅ |
| logAudit（action: deposit_pay/refund） | pay: deposit_payment_initiate；request-refund: deposit_refund_request；admin process: admin_deposit_refund_process | ✅ |
| request-refund params Next 15 | params: Promise<{ lotId }>，await params，使用 lotId | ✅（已修复） |

### 2.4 佣金结算

| 步骤 | 实现 | 状态 |
|------|------|------|
| 订单含 affiliate_id → process-order-payment → calculateAndCreateCommissions | process-order-payment 内调用 | ✅ |
| /api/commissions/pay → 卖家支付 | 校验 obligation.seller_id === user.id；更新 obligation + affiliate_commissions | ✅ |
| 请求体只解析一次、paymentMethod 从 body 取 | POST 内 body = await request.json()，obligationId/paymentTransactionId/paymentMethod 从 body 解构 | ✅（已修复二次 request.json()） |
| logAudit（action: commission_pay） | commissions/pay 成功路径 logAudit(action: 'commission_pay', userId, resourceId: obligationId, result) | ✅（已补充） |
| Admin settle | /api/admin/commissions/[id]/settle，logAudit: admin_commission_settle | ✅ |
| Cron check-overdue-commissions、deduct-overdue-commissions | 任务 18 已验证 | ✅ |

### 2.5 带货推广

| 步骤 | 实现 | 状态 |
|------|------|------|
| RPC 校验 affiliate 订阅 | check_subscription_status(affiliate) | ✅ |
| 创建 post + affiliate_posts + affiliate_products | posts insert → affiliate_posts insert → affiliate_products insert（commission_rate > 0） | ✅ |
| logAudit（action: create_affiliate_post, userId, postId, productId） | logAudit(action: 'create_affiliate_post', userId, resourceId: post.id, meta: { productId }) | ✅（已补充 meta.productId） |
| 后续订单支付 → 佣金生成 | process-order-payment → calculateAndCreateCommissions | ✅ |

---

## 3. 数据一致性与 Cron 联动

| 验证点 | 说明 | 状态 |
|--------|------|------|
| 商品 CRUD → products 表一致 | RLS 限制 seller_id；前端 + Supabase 直写 | ✅ |
| 订单发货 → order_status 与通知同步 | ship 路由内 update + notifications.insert | ✅ |
| 保证金支付/退款 → deposit_lots 状态与通知一致 | pay 创建/更新 lot；request-refund 更新 refunding；admin process 更新 refunded + 通知 | ✅ |
| 佣金 → commissions 表与子订单一致 | calculateAndCreateCommissions；commissions/pay 更新 obligation + affiliate_commissions | ✅ |
| Cron update-deposit-lots-status | held → refundable 等 | ✅ |
| Cron 佣金逾期 | check-overdue-commissions、deduct-overdue-commissions | ✅ |

---

## 4. 审计日志与交叉联动

| 验证点 | 实现 | 状态 |
|--------|------|------|
| 关键操作 logAudit（action、userId/adminId、resourceId、result） | 商品 create/update/delete、ship_order、deposit_payment_initiate、deposit_refund_request、commission_pay、create_affiliate_post、admin_deposit_refund_process、admin_commission_settle | ✅ |
| 不记录敏感字段（价格、支付明文） | meta 仅 obligationId、productId、paymentMethod 等 | ✅ |
| 带货 post → 订单支付 → 佣金生成 → 通知卖家 | process-order-payment → calculateAndCreateCommissions；Cron 逾期扣款 + 通知 | ✅ |
| 发货 → 通知买家 → 子订单状态 | ship 更新 orders + 通知买家 | ✅ |
| 保证金到期 → 禁用卖家功能 → 通知 → Cron | payment-control、update-deposit-lots-status | ✅ |

---

## 5. 本次修复与变更（任务 22）

| 序号 | 问题 | 修复 |
|------|------|------|
| 1 | deposits/request-refund 使用同步 params | 改为 params: Promise<{ lotId: string }>，const { lotId } = await params，全路由使用 lotId；catch 使用 error: unknown。 |
| 2 | commissions/pay POST 二次读取 request.json() | 改为单次 body = await request.json()，从 body 解构 obligationId、paymentTransactionId、paymentMethod；循环内使用顶部 paymentMethod。 |
| 3 | commissions/pay 无 logAudit | 成功路径增加 logAudit(action: 'commission_pay', userId, resourceId: obligationId, resourceType: 'commission_obligation', result: 'success', meta: { obligationId })；catch 使用 error: unknown。 |
| 4 | affiliate/posts/create logAudit 缺少 productId | logAudit 增加 meta: { productId: product_id }。 |

---

## 6. 已采用的正确实践（无需修改）

- **卖家守卫**：useSellerGuard、checkSellerPermission 校验有效 seller 订阅；deposits/request-refund 校验 lot.seller_id。
- **商品 RLS**：products 表仅 seller 本人或 admin/support 可写；卖家页 create/edit/delete 均有 logAudit。
- **保证金**：check、pay、request-refund 权限与状态校验完整；admin process-refund 有 logAudit 与通知。
- **佣金**：commissions/pay 校验 obligation.seller_id；admin settle 有 logAudit 与通知；Cron 逾期处理已覆盖。
- **带货**：affiliate 订阅校验、post + affiliate_posts + affiliate_products 创建、logAudit 含 productId。

---

**审计结论**：卖家后台与带货从商品、订单发货、保证金、佣金到带货推广与 Cron 的端到端链路已按任务 22 要求验证；本次修复了 request-refund 的 params 类型、commissions/pay 的 request 体二次读取与缺失 logAudit、affiliate/posts/create 的 logAudit meta，满足全部验证点。
