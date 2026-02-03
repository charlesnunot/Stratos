# 卖家后台与带货后台 — 审计报告

**审计范围**：卖家后台（/seller/*、收款/保证金/订单相关 API）、带货后台（/affiliate/*、/api/affiliate/*）、商品/订单/财务权限与数据一致性  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 卖家后台权限与访问

**页面与接口**：`/seller/*`（layout 使用 useSellerGuard，非卖家重定向至 /subscription/seller）；`/api/payment-accounts`、`/api/deposits/*`、`/api/orders/[id]/ship` 等（无独立 /api/seller/* 前缀）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 卖家只能访问和管理自己的商品、订单、收款账户 | **通过**：① **页面**：seller layout 使用 `useSellerGuard({ redirectTo: '/subscription/seller' })`，未登录或非有效卖家订阅时重定向。② **收款账户**：GET/POST/PUT/DELETE 及 `[id]`、`set-default` 均校验 `checkSellerPermission`（GET/PUT/DELETE）或 POST 创建时校验卖家权限；单条 GET/PUT/DELETE/set-default 均校验 `seller_id === user.id`。③ **订单**：卖家订单页与发货 API 均按 `seller_id === user.id` 过滤；`/api/orders/[id]/ship` 校验 `order.seller_id === user.id` 且 `checkSellerPermission`。④ **商品**：RLS「Only active users can create products」要求 `auth.uid() = seller_id` 且 profile 为 active；UPDATE 策略允许 `seller_id = auth.uid()` 或 admin/support；卖家商品创建页与列表均依赖 Supabase 查询 + RLS，仅能操作本人数据。 | 通过 | 无。 |
| 只有授权角色（seller/admin）才能执行财务操作（保证金、退款、佣金结算） | **通过**：① **保证金支付**：`/api/deposits/pay` 需登录，通过 `checkSellerDepositRequirement(user.id)` 判断是否需缴保证金，非卖家无 requirement 会返回「No deposit required」；逻辑上仅卖家会进入支付流程。可选增强：显式调用 `checkSellerPermission` 再允许支付。② **保证金退款申请**：`/api/deposits/[lotId]/request-refund` 校验 `lot.seller_id === user.id` 且 status=refundable。③ **保证金退款执行**：`/api/admin/deposits/[lotId]/process-refund` 使用 `requireAdmin`，仅管理员可执行。④ **佣金结算**：`/api/admin/commissions/[id]/settle` 使用 `requireAdmin`，仅管理员可结算。⑤ **卖家查看/支付佣金**：`/api/commissions/pay` GET 仅返回 `seller_id = user.id` 的 obligations 与通过 orders.seller_id 过滤的 commissions；POST 支付逻辑同样按卖家身份校验。 | 通过 | 可选：在 `/api/deposits/pay` 与 `/api/deposits/check` 入口显式增加 `checkSellerPermission`，无权限时 403，与收款账户 API 一致。 |

---

## 2. 商品管理

**页面与接口**：`/seller/products/create`、`/seller/products`、`/seller/products/[id]/edit`；商品 CRUD 通过 Supabase 直接写 `products` 表（RLS 约束）。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 商品数据正确性（价格、库存、分类、描述） | **通过**：创建页校验 name、price>0、图片必填、stock≥0、allow_affiliate 时 commission_rate 0～100；数据以 `seller_id: user.id`、`status: 'pending'` 等写入，价格与库存为数字类型。订单创建时从 DB 读取商品价格与库存，不信任前端传入金额。 | 通过 | 无。 |
| 操作日志记录完整 | **部分**：商品创建、编辑、删除为前端直接调 Supabase，**未**调用 `logAudit`。收款账户的 PUT/DELETE/set-default 已有审计日志；商品侧无统一审计日志。 | **低** | 可选：在商品创建/更新/删除成功的客户端逻辑中调用 `logAudit`（action、userId、resourceId、resourceType: 'product'、result），不记录价格/描述等敏感字段；或通过服务端 API/DB trigger 记录。 |
| 防止越权操作或非法修改 | **通过**：RLS「Only active users can create products」要求 `auth.uid() = seller_id` 且 profile 为 active；「Sellers can update own products」允许 `seller_id = auth.uid()` 或 admin/support。编辑/删除页与列表均依赖当前用户 + RLS，无法越权操作他人商品。 | 通过 | 无。 |

---

## 3. 订单管理

**页面与接口**：`/seller/orders`（列表）、`/api/orders/[id]/ship`（发货）；订单状态与纠纷由订单 API 与 admin 处理。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 卖家只能操作自己订单 | **通过**：卖家订单页查询 `.eq('seller_id', user.id)`；发货 API 先查订单再校验 `order.seller_id === user.id`，非本人返回 403。 | 通过 | 无。 |
| 订单状态流转逻辑正确 | **通过**：发货 API 要求 `payment_status === 'paid'` 且 `order_status === 'paid'` 才可更新为 shipped；取消、确认收货、纠纷等由 `/api/orders/[id]/cancel`、confirm-receipt、dispute 等处理，逻辑与状态机一致。 | 通过 | 无。 |
| 异常订单（退款、纠纷）处理正确 | **通过**：退款由 admin 的 `/api/admin/refunds/process` 处理；纠纷由 `/api/orders/[id]/dispute` 与 respond 及 admin disputes 处理，已有权限校验与审计日志（见支付与权限审计）。 | 通过 | 无。 |

---

## 4. 财务与保证金

**页面与接口**：`/api/deposits/pay`、`/api/deposits/check`、`/api/deposits/[lotId]/request-refund`；`/api/admin/deposits/[lotId]/process-refund`；`/api/admin/commissions/[id]/settle`；`/api/commissions/pay`。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 只能由授权卖家操作 | **通过**：保证金支付与退款申请均校验 `lot.seller_id === user.id` 或通过 seller_id 限定；deposit 逻辑上仅对卖家存在 requirement。佣金结算为 admin only；卖家侧佣金查询/支付按 `seller_id = user.id` 过滤。 | 通过 | 可选：deposits/pay、deposits/check 显式 `checkSellerPermission`，无权限 403。 |
| 后端校验完整，防止绕过前端 | **通过**：收款账户、发货、保证金申请、佣金查询等均在服务端校验身份与归属；关键财务操作（退款执行、佣金结算）为 admin only，且 requireAdmin 校验 role。 | 通过 | 无。 |
| 操作有日志记录 | **通过**：收款账户 PUT/DELETE/set-default 有 logAudit；admin 的 process-refund、commission settle 有 logAudit；订单纠纷、取消等已有审计（见前期审计）。 | 通过 | 无。 |

---

## 5. 带货后台权限与数据

**页面与接口**：`/affiliate/products/[id]/promote`（推广页）、`/api/affiliate/posts/create`；带货统计与佣金数据通过 Supabase 与 `/api/commissions/pay` 等获取。

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 带货商品、推广页、数据统计只能由授权用户访问 | **通过**：① **推广页**：未登录重定向登录；已登录但无有效带货订阅时重定向至 `/subscription/affiliate`；创建推广帖调用 `/api/affiliate/posts/create`，该 API 通过 RPC `check_subscription_status(p_subscription_type: 'affiliate')` 校验，无订阅返回 403。② **带货数据/佣金**：卖家侧佣金 API 已按 seller_id 过滤；带货侧若存在「我的推广/佣金」类页面，应仅查询当前用户 affiliate_id 的数据（与 commissions 设计一致）。 | 通过 | 无。 |
| 数据统计结果准确 | **通过**：佣金与订单数据来自 DB 与 RPC，统计逻辑在服务端；affiliate_posts/create 正确关联 post、affiliate_products、commission_rate。 | 通过 | 无。 |
| 无法访问他人推广或佣金数据 | **通过**：`/api/affiliate/posts/create` 仅创建当前 user 的 post 与 affiliate_post；`/api/commissions/pay` GET 仅返回当前 user 作为 seller 的 obligations 与 commissions；RLS 与查询条件保证无法拉取他人推广或佣金明细。 | 通过 | 无。 |

---

## 6. 异常处理与日志

### 6.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 异常操作、错误操作是否有日志 | **部分**：收款账户更新/删除/set-default、admin 保证金退款、佣金结算、订单纠纷等已有 logAudit 或结构化日志；商品创建/编辑/删除、带货帖子创建、发货成功等**未**统一调用 logAudit。 | **低** | 可选：商品关键操作（创建/删除）、带货帖子创建成功、发货成功等增加 logAudit（action、userId、resourceId、result），不记录敏感字段。 |
| 日志中敏感数据是否保护 | **通过**：现有 logAudit 不记录 account_info、密码、完整订单金额等；错误日志为 message/context，未发现输出用户输入原文或支付详情。 | 通过 | 保持规范；新增日志继续不记录敏感字段。 |

---

## 7. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | 商品/带货操作无审计日志 | 商品创建·编辑·删除、带货帖子创建、发货成功未记录 logAudit | **低** | 可选：关键操作增加 logAudit（action、userId、resourceId、result） |
| 2 | 保证金 API 未显式校验卖家身份 | deposits/pay、deposits/check 未调用 checkSellerPermission，依赖「无 requirement 即不可支付」 | **低** | 可选：入口显式 checkSellerPermission，无权限 403 |

---

## 8. 已采用的正确实践（无需修改）

- **卖家页面**：seller layout 使用 useSellerGuard，非卖家重定向至订阅页；商品创建页再次校验卖家订阅与登录。
- **收款账户**：GET/POST/PUT/DELETE 及 [id]、set-default 均校验卖家权限或账户归属；POST 创建需 checkSellerPermission；PUT/DELETE/set-default 有 logAudit。
- **订单**：卖家订单列表与发货 API 均按 seller_id 校验；发货前校验订单状态与 checkSellerPermission。
- **保证金**：支付与退款申请均按 seller_id/lot 归属校验；退款执行仅 admin；process-refund、commission settle 有 logAudit。
- **带货**：推广页与 API 校验 affiliate 订阅；affiliate posts create 校验订阅与商品 allow_affiliate；佣金数据按 seller_id 过滤。
- **商品 RLS**：创建要求 seller_id = auth.uid() 且 active；更新/删除仅本人或 admin/support。
- **Admin**：requireAdmin/requireAdminOrSupport 统一校验 role；敏感操作均有审计日志。

---

## 9. 修复执行状态（已完成）

| 项 | 修复内容 | 状态 |
|----|----------|------|
| 商品管理 logAudit | 商品创建成功（create/page）、编辑成功（edit/page）、删除成功（products/page）时调用 logAudit（action: create_product / update_product / delete_product，userId、resourceId、resourceType: 'product'、result: 'success'）；删除时显式 .eq('seller_id', user.id) | ✅ 已实现 |
| 带货帖子创建 logAudit | `/api/affiliate/posts/create` 创建 post 与 affiliate_post 成功后调用 logAudit（action: 'create_affiliate_post'，userId、resourceId: post.id、resourceType: 'affiliate_post'、result: 'success'） | ✅ 已实现 |
| 发货操作 logAudit | `/api/orders/[id]/ship` 发货成功后调用 logAudit（action: 'ship_order'，userId、resourceId: order.id、resourceType: 'order'、result: 'success'） | ✅ 已实现 |
| 保证金 API 显式权限 | `/api/deposits/pay` 与 `/api/deposits/check` 入口显式调用 checkSellerPermission(user.id)，无权限返回 403 | ✅ 已实现 |

**涉及文件**：`src/app/[locale]/(main)/seller/products/create/page.tsx`、`src/app/[locale]/(main)/seller/products/page.tsx`、`src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx`、`src/app/api/affiliate/posts/create/route.ts`、`src/app/api/orders/[id]/ship/route.ts`、`src/app/api/deposits/pay/route.ts`、`src/app/api/deposits/check/route.ts`。

---

**审计结论**：卖家后台与带货后台在权限控制、订单归属、财务操作与数据隔离方面表现良好；**商品/带货/发货的 logAudit** 及 **保证金 API 显式 checkSellerPermission** 已落地。
