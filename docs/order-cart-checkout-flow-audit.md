# 订单、购物车与结账流程完整性 — 系统性审计报告

**审计范围**：购物车操作、结账流程、订单创建与状态管理、异常处理与回滚、日志与追踪  
**审计日期**：2025-01-31  
**结论**：按检查点逐项列出发现问题、风险等级与修复建议，便于追踪。

---

## 1. 购物车操作

### 1.1 页面：/main/cart

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 添加、删除、更新商品数量是否同步到后端 | 不同步 | **低** | 购物车使用 **纯前端** 方案：`cartStore`（Zustand + persist）存于 **localStorage**，无服务端购物车表；添加/删除/更新数量仅改本地状态。**建议**：若业务要求多端同步（换设备/换浏览器仍见同一购物车），需增加服务端购物车表与 API，并在 add/remove/update 时同步；当前方案下在文档中明确「购物车仅限本设备」。 |
| 用户只能操作自己的购物车 | 通过 | - | 无服务端购物车时，数据在用户本机 localStorage，天然隔离；同一设备多账号切换时，localStorage 的 `cart-storage` 键可能被下一用户读到（取决于是否登出清空）。**建议**：若支持同设备多账号，在登出时清空或按 userId 隔离 key（如 `cart-storage-${userId}`）。 |
| 库存变化是否实时反映 | 通过 | - | 购物车页通过 **useCartValidation**：1）对 `products` 表做 **Realtime 订阅**（UPDATE 时触发验证）；2）**validateItems(supabase)** 拉取当前 stock/status/price 与购物车项比对；3）商品变化时防抖重新验证；4）无效项（缺货/下架/价格变动）可移除或提示。库存/状态/价格变化能较实时反映。 |

---

## 2. 结账流程

### 2.1 页面：/main/checkout，接口：/api/checkout、/api/orders/create

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 订单价格、优惠、运费计算是否正确 | 无优惠/运费 | **低** | 当前 **无优惠券、无运费** 逻辑：订单总价 = Σ(item.price × item.quantity)，与 `/api/orders/create` 及 DB 一致。**建议**：若后续增加优惠/运费，必须在服务端用同一规则重算并写入订单，禁止仅前端计算。 |
| 商品库存是否校验，防止超卖 | 通过 | - | **创建订单**：`/api/orders/create` 从 DB 拉取 `products.stock`，校验 `product.stock < item.quantity` 则加入 validationErrors，拒绝创建。**支付成功**：`process_order_payment_transaction`（PostgreSQL）内对 `orders`、`products` 行 **FOR UPDATE** 锁，扣减库存；已支付则幂等返回，避免重复扣减。创建时校验 + 支付时原子扣减，可防超卖。 |
| 前端提交订单时后端二次校验是否存在 | 通过 | - | 结账页 **handleCheckout** 先拉取 products 做库存/状态/价格校验，再调 `/api/orders/create`；**后端**再次拉取 products、校验 stock/status/price（误差 ≤0.01）、校验卖家支付就绪与收货地址，不信任前端。存在完整二次校验。 |
| /api/checkout 与订单创建关系 | 说明 | - | 项目中 **无** `/api/checkout` 路由；结账直接调用 **/api/orders/create**。另有 **/api/checkout/validate-product** 供「立即购买/加购前」单商品可购性校验（需登录）。 |

---

## 3. 订单创建与状态管理

### 3.1 订单只能由用户自己创建

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 创建人身份 | 通过 | - | `/api/orders/create` 使用 `supabase.auth.getUser()`，未登录返回 401；订单组与子订单的 **buyer_id** 均为 `user.id`，无其他入参可篡改买家。 |
| 订单列表可见范围 | 通过 | - | `/main/orders` 服务端查询 `.or(\`buyer_id.eq.${user.id},seller_id.eq.${user.id}\`)`，用户仅能见自己作为买家或卖家的订单。 |

### 3.2 订单状态流转与防重复/越权

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 状态流转 | 通过 | - | 流程：**创建**（pending）→ **支付**（payment_status=paid, order_status=paid）→ **发货**（shipped）→ **确认收货**（completed）；或 **取消**（cancelled）、**退款/纠纷**。与代码及 DB 设计一致。 |
| 发货 /api/orders/[id]/ship | 通过 | - | 校验当前用户为 **seller**（order.seller_id === user.id）、卖家权限、**payment_status=paid 且 order_status=paid**；仅卖家可发货，且已支付才可发货。 |
| 确认收货 /api/orders/[id]/confirm-receipt | 通过 | - | 校验当前用户为 **buyer**（order.buyer_id === user.id）、**order_status=shipped**；仅买家可确认，且已发货才能确认。**重复确认**：确认后 order_status=completed，再次请求时 `order_status !== 'shipped'` 返回 400，故不会重复更新；建议错误文案在「已 completed」时改为「订单已确认收货」以更友好。 |
| 取消 /api/orders/[id]/cancel | 通过 | - | 校验当前用户为 **buyer 或 seller 或 admin**；已 cancelled/completed/shipped 时返回 400；已支付时走退款并调用 `cancel_order_and_restore_stock` 原子取消并回滚库存。 |
| 纠纷 /api/orders/[id]/dispute | 通过 | - | 校验当前用户为 **buyer 或 seller**；存在 pending/reviewing 纠纷时禁止重复创建。 |

---

## 4. 异常处理与回滚

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 支付失败时订单状态 | 通过 | - | 库存扣减仅在 **process_order_payment_transaction**（支付成功）内执行；支付失败或未回调时订单保持 pending，**不扣库存**，状态一致。 |
| 库存不足时 | 通过 | - | 创建订单时后端校验 stock，不足则返回 validation 错误，**不创建订单**；支付事务内对 products 行加锁再扣减，若事务失败则整体回滚。 |
| 网络异常时 | 部分 | **低** | 前端提交订单若网络失败或超时，**不会**执行 `removeSelectedItems()`（仅成功且 `response.ok` 且解析到 orders 后才移除选中项），购物车保留，用户可重试。**建议**：对 5xx/超时做明确提示「订单可能已创建，请到订单列表查看」，避免重复下单。 |
| 订单创建部分成功 | 部分 | **低** | 多卖家时，`/api/orders/create` 按卖家循环创建子订单，某一卖家失败仅该卖家不入库，其他卖家订单可能已创建；返回 errors 数组与已创建的 orders。**建议**：前端明确展示「部分订单创建失败」及失败原因，并引导用户对未创建部分重试或清空购物车对应项。 |

---

## 5. 日志与追踪

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 订单操作是否有日志可追踪 | 仅错误日志 | **中** | **orders/create**、**ship**、**confirm-receipt**、**cancel** 等仅在异常时 `console.error`，**成功路径无**结构化审计日志（谁、何时、订单 ID、操作类型）。**建议**：对订单创建、发货、确认收货、取消、纠纷创建等成功/失败均记录结构化日志（userId、orderId、action、result、timestamp），便于对账与客诉排查。 |
| 日志中是否避免敏感信息泄露 | 通过 | - | 审计范围内未发现日志中打印密码、完整卡号、token；错误日志多为 message/code。**建议**：规范中明确不记录收货地址全文、支付凭证等敏感信息，仅记录操作类型与资源 ID。 |

---

## 6. 其他发现

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 收货地址归属 | 通过 | - | 创建订单时若传 `shipping_address_id`，后端从 `user_addresses` 查并校验 `user_id === user.id`，防止使用他人地址。 |
| 库存扣减原子性 | 通过 | - | `process_order_payment_transaction` 在单次 DB 事务内：锁订单 → 校验未支付、金额一致 → 更新订单 → 锁并扣减 order_items 对应 products 库存，保证原子性。 |
| 取消后库存回滚 | 通过 | - | 取消使用 `cancel_order_and_restore_stock` 原子取消订单并回滚库存。 |

---

## 7. 修复优先级汇总

| 优先级 | 检查点 | 风险等级 | 建议动作 |
|--------|--------|----------|----------|
| P1 | 无 | - | - |
| P2 | 订单操作无成功审计日志 | 中 | 对订单创建、发货、确认收货、取消、纠纷等成功/失败记录结构化审计日志（userId、orderId、action、result、timestamp），不记录敏感字段 |
| P3 | 购物车仅前端、不同步后端 | 低 | 若需多端一致，增加服务端购物车与同步 API；否则在文档中说明「购物车仅限本设备」 |
| P3 | 同设备多账号购物车隔离 | 低 | 登出时清空或按 userId 隔离 localStorage key（如 `cart-storage-${userId}`） |
| P3 | 网络异常/部分创建成功提示 | 低 | 5xx/超时时提示「请到订单列表确认是否已下单」；部分创建失败时明确提示并引导重试或清理购物车 |
| P3 | 确认收货已完成后错误文案 | 低 | 当 order_status 已为 completed 时返回「订单已确认收货」类文案 |

---

**审计结论**：订单、购物车与结账流程在**身份校验、后端二次校验、库存防超卖、状态流转与权限控制、支付/取消的原子性**方面设计正确；主要改进点为**订单相关操作的结构化审计日志**（P2），以及购物车多端同步与异常提示等体验与可追溯性优化（P3）。按上表优先级逐项落实即可提升完整性与可运维性。
