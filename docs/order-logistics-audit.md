# 订单模块与物流管理 — 审计报告

**审计范围**：订单创建与管理、支付与结账、发货与物流追踪、售后与反馈、异常处理与日志  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议；已修复项已落地。

---

## 1. 订单创建与管理

**页面与接口**：`/main/orders`、`/main/checkout`、`/api/orders/create`、`/api/orders/[id]/*`。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能查看和操作自己的订单 | **通过**：orders 表 RLS “Users can view own orders” 为 buyer_id/seller_id/affiliate_id/admin；列表与详情经 Supabase 查询，仅返回 RLS 允许行；cancel/confirm-receipt/ship 均校验 buyer 或 seller 或 admin。 | 通过 | 无。 |
| 订单状态（待付款、已付款、发货中、已收货、已取消）逻辑正确 | **通过**：order_status 与 payment_status 配合；cancel 禁止已发货/已完成；ship 要求已付款；confirm-receipt 要求已发货；processOrderPayment 更新为 paid，ship 更新为 shipped，confirm-receipt 更新为 completed。 | 通过 | 无。 |
| 后端接口是否校验库存、价格和权限 | **通过**：orders/create 校验 product 存在、status=active、stock≥quantity、price 与请求误差≤0.01；创建订单 buyer_id 来自 auth；支付创建与回调在审计 20 中已校验金额与归属。 | 通过 | 无。 |

---

## 2. 支付与结账流程

**页面与接口**：`/main/checkout`、`/api/checkout/validate-product`、`/api/payments/*`。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 结账流程金额与订单匹配 | **通过**：审计 20 已修复 Alipay/WeChat/PayPal create-order 使用 order.total_amount；Stripe create-order-checkout-session 使用 order.total_amount；processOrderPayment 校验 amount 与 order.total_amount。 | 通过 | 无。 |
| 支付回调正确更新订单状态 | **通过**：各渠道回调/webhook 调用 processOrderPayment，订单更新为 paid；ship/confirm-receipt 分别更新为 shipped/completed。 | 通过 | 无。 |
| 防止重复支付或篡改订单金额 | **通过**：创建支付前检查 payment_status !== 'paid'；回调幂等；审计 20 已修复订单金额服务端强制。 | 通过 | 无。 |

---

## 3. 发货与物流追踪

**页面与接口**：`/orders/[id]/tracking`、`/api/orders/[id]/ship`；无独立 `/api/orders/[id]/tracking`，物流数据存 orders 表 + 第三方 trackLogistics。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 卖家只能更新自己订单的物流信息 | **通过**：ship 接口校验 order.seller_id === user.id、checkSellerPermission；仅允许已付款订单发货。 | 通过 | 无。 |
| 用户能正确查看物流状态 | **通过**：tracking 页服务端校验当前用户为 buyer 或 seller 后渲染 OrderTrackingClient；物流单号与承运商来自 orders 表，第三方 trackLogistics 仅用于展示轨迹。 | 通过 | 无。 |
| 异常订单（延迟、丢件）处理逻辑正确 | **部分**：无内置“延迟/丢件”状态；纠纷与超时逻辑在 dispute/cron 中。 | 低 | 可选：增加物流异常状态或工单联动。 |
| 物流字段防超长或异常输入 | **已修复**：ship 原未限制 tracking_number/logistics_provider 长度。已增加 trim、类型校验、tracking_number≤100、logistics_provider≤50，超限返回 400。 | ~~低~~ 已修复 | 无。 |

### 3.2 已实施修复（发货）

- **`src/app/api/orders/[id]/ship/route.ts`**：对 tracking_number、logistics_provider 做 trim、类型与长度校验（100/50 字符），使用校验后值写入与通知。

---

## 4. 售后与反馈

**页面与接口**：`/orders/[id]/feedback`；反馈经 Supabase seller_feedbacks 表 + RLS。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能对自己的订单提交反馈 | **已修复**：原 seller_feedbacks INSERT 仅 WITH CHECK (auth.uid() = buyer_id)，未校验 order_id 对应订单的 buyer 为本人，可为他单伪造评价。已增加 RLS：INSERT 需 EXISTS (orders 且 orders.buyer_id = auth.uid())。 | ~~中~~ 已修复 | 无。 |
| 反馈和评分数据与订单对应 | **通过**：order_id、buyer_id、seller_id 与订单一致；RLS 与页面均限制仅买家、仅已完成订单可提交。 | 通过 | 无。 |
| 异常反馈处理安全、可追踪 | **已修复**：反馈评论原未做 XSS 与长度限制。已增加 sanitizeContent(comment)、评论最长 1000 字，超长或未评分时前端提示。 | ~~低~~ 已修复 | 无。 |

### 4.2 已实施修复（反馈）

- **`supabase/migrations/193_seller_feedbacks_insert_order_ownership.sql`**：替换 “Buyers can create their own feedback” 为 “Buyers can create feedback for own orders only”，WITH CHECK 增加 EXISTS (orders.id = order_id AND orders.buyer_id = auth.uid())。
- **`src/app/[locale]/(main)/orders/[id]/feedback/page.tsx`**：提交前对 comment 做 sanitizeContent、长度≤1000，否则 toast 提示。

---

## 5. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 异常订单操作（取消、退货、退款）有日志记录 | **通过**：ship 成功有 logAudit(ship_order)；cancel 有 logAudit（见 cancel 路由）；dispute/refund 在 admin 与支付流程中有日志。confirm-receipt 无 logAudit。 | 低 | 可选：confirm-receipt 成功时增加 logAudit。 |
| 日志中敏感信息受保护 | **通过**：审计与错误日志不记录支付凭证、完整地址、银行卡号；仅记录 orderId、resourceId、action 等。 | 通过 | 无。 |
| 系统异常时订单状态可恢复 | **通过**：支付与订单更新使用 RPC/事务；失败不写 paid；cancel/ship 失败返回错误不更新状态。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 状态 |
|------|--------|----------|----------|------|
| 1 | seller_feedbacks 可为他人订单插入反馈 | INSERT 仅校验 buyer_id=auth.uid()，未校验 order 归属，可伪造评价 | ~~中~~ | **已修复**：RLS 增加 order 归属校验 |
| 2 | 发货物流字段无长度校验 | tracking_number/logistics_provider 可超长或异常 | ~~低~~ | **已修复**：100/50 字符 + trim |
| 3 | 反馈评论未 sanitize 与长度限制 | XSS 与超长风险 | ~~低~~ | **已修复**：sanitizeContent + 1000 字 |

---

## 7. 已采用的正确实践（无需修改）

- **订单 RLS**：仅 buyer/seller/affiliate/admin 可查看；INSERT 仅 buyer_id = auth.uid()。
- **orders/create**：校验库存、价格、商品状态；订单金额由服务端计算。
- **ship**：校验 seller、已付款、checkSellerPermission；成功 logAudit。
- **confirm-receipt**：仅买家、仅已发货可确认。
- **cancel**：买家/卖家/管理员可取消，已发货/已完成不可取消，有 logAudit。
- **tracking 页**：服务端校验 buyer 或 seller 后渲染，物流数据来自 orders + 第三方查询。

---

## 8. 可选后续优化

- confirm-receipt 成功时增加 logAudit(action: 'confirm_receipt', resourceId: orderId)。
- 物流异常（延迟、丢件）与纠纷/工单状态联动或增加统一状态枚举。
- 反馈更新接口若使用 camelCase 字段名，需与 DB snake_case 对齐或做映射。
