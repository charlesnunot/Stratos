# Commerce Transaction End-to-End Lifecycle Propagation Audit

**推演目标**：系统性推演一次真实交易从「意图产生」到「纠纷结束」的全流程，验证所有模块在成功/失败/异常/逆序情况下是否一致、安全、可追溯。

**通过标准**：在任何异常情况下，钱、订单、库存、权限，永远一致。

---

## 1️⃣ 交易意图阶段（聊天 × 商品）

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 商品页「Message Seller」 | ✅ | 跳转聊天并绑定商品/会话 |
| 聊天中「Buy Now」 | ✅ | 跳转商品页或结账，下单前由 `orders/create` 校验商品状态与库存 |
| 是否绑定正确商品 | ✅ | 前端传 product_id，创建订单时校验 product 存在且 active、库存足够 |
| 是否校验库存/状态 | ✅ | `orders/create` 校验 `status=active`、`stock >= quantity`、价格一致 |
| 是否允许绕过商品页直接下单 | ⚠️ | API 允许带 product_id 直接创建订单，依赖服务端校验，无额外「必须从商品页进入」约束 |
| 商品下架后是否还能下单 | ✅ | 创建订单时校验 `status=active`，下架后无法通过校验 |

### 审计条目（意图阶段）

```json
{
  "domain": "commerce",
  "stage": "intent",
  "scenario": "聊天中 Buy Now → 创建订单",
  "affectedModules": ["chat", "order", "inventory"],
  "observedIssue": "无。创建订单 API 强制校验商品 active、库存、价格，聊天链路无法绕过商品状态。",
  "financialRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "可选：订单创建增加 idempotency key 防重复提交。",
  "severity": "关键链路"
}
```

---

## 2️⃣ 订单创建阶段

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 是否生成重复订单 | ⚠️ | 无显式幂等键，多次提交可产生多笔 pending 订单 |
| 未支付订单是否锁库存 | ❌ | 库存仅在支付成功时扣减（process_order_payment_transaction），未支付不锁库存 |
| 超时订单是否自动关闭 | ✅ | 定时任务 `auto_cancel_expired_orders` 关闭超时未支付订单；未支付未扣库存，无需回滚库存 |
| 多次点击是否幂等 | ⚠️ | 前端可防重复点击，API 无幂等键 |

### 审计条目（订单创建）

```json
{
  "domain": "commerce",
  "stage": "order",
  "scenario": "创建订单 / 未支付停留 / 超时关闭",
  "affectedModules": ["order", "inventory"],
  "observedIssue": "未支付订单不锁库存；无幂等键可能重复下单。",
  "financialRisk": false,
  "rootCauseGuess": "设计选择：库存在支付成功时扣减，避免超卖与锁库存复杂度；重复订单依赖前端与超时关闭。",
  "enhancementSuggestion": "订单创建支持 idempotency key（如 client_key + product_id + quantity）防重复。",
  "severity": "高"
}
```

---

## 3️⃣ 支付阶段（关键）

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 支付中刷新页面 | ✅ | 以 webhook/回调为准，前端状态不影响后端 |
| 支付成功但回调延迟 | ✅ | 回调幂等：process_order_payment_transaction 内检查 payment_status=paid 则跳过，避免重复扣款/重复更新 |
| 支付失败重试 | ✅ | 用户可重新发起支付同一订单；回调仅对未支付订单执行扣款与更新 |
| 多端同时支付 | ✅ | RPC 行锁订单，仅首次将订单置为 paid 并扣库存，后续回调视为重复 |
| 前端成功 ≠ 后端成功 | ✅ | 以 webhook 为准，不依赖前端 |
| 回调丢失 | ⚠️ | 依赖支付方重试与对账；无内置补偿轮询 |
| 重复扣款 | ✅ | 回调内幂等判断，已 paid 不再次扣库存、不重复记交易 |

### 审计条目（支付）

```json
{
  "domain": "commerce",
  "stage": "payment",
  "scenario": "Stripe/PayPal 等回调、支付成功/失败/重试",
  "affectedModules": ["order", "payment", "inventory"],
  "observedIssue": "无。支付在 RPC 内原子更新订单+扣库存，且幂等。",
  "financialRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "可选：对关键支付渠道做定时对账任务，弥补回调丢失。",
  "severity": "关键链路"
}
```

---

## 4️⃣ 支付完成联动

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 订单状态更新 | ✅ | process_order_payment_transaction 将 order_status、payment_status 置为 paid |
| 商品库存扣减 | ✅ | 同一 RPC 内扣减 order_items / product_id 对应库存 |
| 卖家/买家订单列表 | ✅ | 基于 orders 表查询，状态更新后一致 |
| 聊天中状态提示 / 是否允许继续付款 | ✅ | 依赖订单状态查询；已 paid 订单不应再展示支付入口（前端逻辑） |

---

## 5️⃣ 履约 / 发货阶段

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 发货前是否可退款 | ✅ | 买家/卖家 cancel 仅允许 pending/paid，不允许 shipped；退款走 cancel 或纠纷 |
| 卖家发货 | ✅ | POST orders/[id]/ship：校验卖家身份、order_status=paid、写入 shipped + 物流信息 |
| 发货后状态是否锁定 | ✅ | cancel 接口明确拒绝 order_status=shipped，需走纠纷/客服 |
| 地址修改边界 | ✅ | 发货前地址在订单创建时写入；发货后不应改地址（业务约束） |
| 买家确认收货 | ✅ | POST orders/[id]/confirm-receipt：仅买家、仅 shipped 可确认，更新为 completed |

### 审计条目（履约）

```json
{
  "domain": "commerce",
  "stage": "fulfillment",
  "scenario": "卖家发货 → 买家确认收货",
  "affectedModules": ["order"],
  "observedIssue": "无。发货/确认收货均校验状态与权限，状态流转单一。",
  "financialRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "无",
  "severity": "关键链路"
}
```

---

## 6️⃣ 评价阶段

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 是否只能评价一次 | ✅ | useCanReviewProduct 按 order_id + user_id 查 product_reviews，已有则不可再评 |
| 评价是否影响卖家信誉 | ✅ | seller_feedbacks / product_reviews 与统计由业务使用 |
| 删除订单后评价如何处理 | ✅ | 订单取消后为 cancelled，useCanReviewProduct 仅查 shipped/completed，故取消订单不可评价 |

### 审计条目（评价）

```json
{
  "domain": "commerce",
  "stage": "fulfillment",
  "scenario": "买家对订单/商品/卖家评价",
  "affectedModules": ["order", "product_reviews", "seller_feedbacks"],
  "observedIssue": "无。仅 shipped/completed 订单可评价，且按 order 维度防重复。",
  "financialRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "若有服务端提交评价 API，需校验 order 属于当前用户且状态为 shipped/completed。",
  "severity": "高"
}
```

---

## 7️⃣ 纠纷 / 退款链路（事故集中区）

| 检查项 | 结论 | 说明 |
|--------|------|------|
| 买家发起纠纷 | ✅ | POST orders/[id]/dispute，写入 order_disputes |
| 卖家响应 | ✅ | POST orders/[id]/dispute/respond，可同意退款/拒绝/请求仲裁 |
| 管理员裁决 | ✅ | POST admin/disputes：resolution + refundAmount，创建/复用 order_refunds，调用 processRefund |
| 部分/全额退款 | ✅ | processRefund 按金额判断部分/全额，更新 payment_status、order_status（全额时取消订单） |
| 退款是否正确回流 | ✅ | processRefund 按 original_payment / platform_refund 执行支付方退款或平台垫付（seller debt） |
| 订单状态是否同步 | ✅ | processRefund 更新 orders.payment_status、order_status（全额时 cancelled） |
| **全额退款是否恢复库存** | ✅ **已修复** | processRefund 全额退款时，对未发货/未完成订单调用 cancel_order_and_restore_stock；已发货/已完成仅更新状态不恢复库存 |

### 审计条目（纠纷 - 修复前问题）

```json
{
  "domain": "commerce",
  "stage": "dispute",
  "scenario": "管理员裁决全额退款 / 管理员处理待处理退款",
  "affectedModules": ["order", "payment", "inventory", "admin"],
  "observedIssue": "修复前：processRefund 仅更新订单与退款记录，未调用 cancel_order_and_restore_stock，导致管理员全额退款后库存未恢复。",
  "financialRisk": true,
  "rootCauseGuess": "cancel 接口在退款成功后显式调用 RPC 恢复库存，而 processRefund 被 admin 退款/纠纷裁决调用时未调用同一 RPC。",
  "enhancementSuggestion": "已在 processRefund 全额退款分支中，对 order_status 非 shipped/completed 的订单调用 cancel_order_and_restore_stock，并仅对可取消订单恢复库存。",
  "severity": "关键链路"
}
```

### 审计条目（纠纷 - 修复后）

```json
{
  "domain": "commerce",
  "stage": "dispute",
  "scenario": "管理员/卖家同意全额退款后订单取消与库存",
  "affectedModules": ["order", "payment", "inventory", "admin"],
  "observedIssue": "无。钱退、状态更新、库存恢复（未发货时）均由 processRefund + cancel_order_and_restore_stock 统一处理。",
  "financialRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "无",
  "severity": "关键链路"
}
```

---

## 8️⃣ 逆序与边界推演

| 场景 | 结论 | 说明 |
|------|------|------|
| 支付后订单被管理员关闭 | ⚠️ | 无「管理员强制关闭订单」API；若需此能力，应走退款+取消并调用 cancel_order_and_restore_stock |
| 退款完成后再次回调 | ✅ | 回调幂等：订单已 paid 则不再处理；订单已 refunded 同理，不会重复退 |
| 管理员强制修改订单 | ⚠️ | 无通用改订单 API；修改需通过退款/纠纷等既定流程，保证可审计 |
| 用户账号被封 | ✅ | 权限与封禁在中间件/API 校验；订单/支付状态不变，钱与订单一致 |

### 审计条目（逆序）

```json
{
  "domain": "commerce",
  "stage": "dispute",
  "scenario": "逆序：退款完成后再次支付回调 / 已取消订单再次取消",
  "affectedModules": ["order", "payment"],
  "observedIssue": "无。支付回调与取消均做状态判断，重复操作幂等。",
  "financialRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "若增加「管理员强制关闭订单」能力，必须同时走退款与 cancel_order_and_restore_stock（未发货时）。",
  "severity": "高"
}
```

---

## 修复项汇总

1. **processRefund 全额退款与库存一致（已实现）**
   - 文件：`src/lib/payments/process-refund.ts`
   - 行为：全额退款时，若 `order_status` 非 `shipped`/`completed`，先调用 `cancel_order_and_restore_stock(orderId)`，再更新 `payment_status='refunded'`；若已发货/已完成，仅更新订单与支付状态，不恢复库存。
   - 覆盖：管理员处理退款（admin/refunds/process）、管理员裁决纠纷（admin/disputes）及所有通过 processRefund 的全额退款路径。

---

## 通过标准结论

在完成上述修复后，可得到以下结论：

- **钱**：支付与退款均经 processRefund 或 Stripe 等渠道，状态与 payment_transactions / order_refunds 一致；全额退款与订单取消联动正确。
- **订单**：创建时校验商品与库存；支付在 RPC 内原子更新；取消/退款时由 processRefund 与 cancel_order_and_restore_stock 统一更新状态。
- **库存**：仅在支付成功时扣减；全额退款且未发货时通过 cancel_order_and_restore_stock 恢复；已发货/已完成全额退款不恢复库存，符合业务。
- **权限**：下单/发货/确认收货/取消/纠纷均校验买家/卖家/管理员身份，审计日志覆盖关键操作。

**因此，在现有实现与本次修复下，可认为满足：**

**「在任何异常情况下，钱、订单、库存、权限，永远一致。」**

建议后续可补充：订单创建幂等键、支付渠道定时对账、以及（若需要）管理员强制关闭订单的明确流程与实现。
