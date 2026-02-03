# 用户权限与访问控制 — 审计报告

**审计范围**：角色访问校验、页面与 API 权限、敏感操作安全、异常访问处理、日志与追踪  
**审计日期**：2025-01-31  
**结论**：按检查点输出发现问题、风险等级与修复建议，便于追踪。

---

## 1. 角色访问校验

### 1.1 卖家功能：`/main/seller/*`、`/api/seller/*`

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 普通用户是否无法访问卖家页面 | **部分**：卖家页面仅校验登录（`useAuth`），未校验「卖家角色/订阅」。任何已登录用户均可访问 `/seller/*`，数据因 `seller_id = user.id` 或 RLS 多为空，但页面可打开。 | **低** | 可选：在卖家布局或关键页（如 `/seller/dashboard`）服务端/客户端校验 `profile.subscription_type === 'seller'` 或 `profile.role === 'seller'`，非卖家重定向至首页或订阅页，减少误用与入口暴露。 |
| 普通用户是否无法访问卖家 API | **无**：无独立 `/api/seller/*` 路由；卖家能力通过 Supabase 直连（产品 CRUD、订单列表等）与 `/api/payment-accounts`、`/api/deposits/*`、`/api/commissions/pay` 等实现。`/api/payment-accounts` 已使用 `checkSellerPermission`，未通过则 403。 | 通过 | 保持现状；新增卖家专用 API 时统一做 `checkSellerPermission`。 |
| 卖家是否无法访问他人卖家数据 | **通过**：产品列表/编辑均按 `seller_id = user.id` 查询；产品编辑页校验 `product.seller_id !== user.id` 时重定向；RLS 对 `products` 的 INSERT 要求 `auth.uid() = seller_id`；收款账户 API 校验 `account.seller_id === user.id`。 | 通过 | 无。 |

**说明**：产品创建为前端直连 Supabase `products.insert`，RLS 仅要求 `auth.uid() = seller_id` 且 `profiles.status = 'active'`，**不校验卖家订阅**。理论上未购卖家订阅的用户若绕过前端（如控制台直调）可插入待审核商品，属业务策略取舍；若需严格「仅订阅卖家可创建」，需在 DB 触发器或统一的产品创建 API 中校验订阅。

---

### 1.2 带货功能：`/main/affiliate/*`、`/api/affiliate/*`

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 普通用户是否无法访问带货页面 | **部分**：带货页（如 `/affiliate/products/[id]/promote`）仅校验登录；是否展示「推广」能力依赖前端 `hasActiveAffiliateSubscription`。未订阅用户可打开页面，但创建推广会走 API 被拒。 | **低** | 可选：在带货布局或入口页校验订阅状态，无有效带货订阅时重定向至订阅页或首页。 |
| 普通用户是否无法访问带货 API | **通过**：`/api/affiliate/posts/create` 要求登录后调用 RPC `check_subscription_status(p_user_id, 'affiliate', ...)`，未通过则 403，且校验产品 `allow_affiliate`。 | 通过 | 无。 |
| 带货者是否无法访问他人数据 | **通过**：创建推广帖绑定 `affiliate_id: user.id`，产品读取为公开或按产品 ID，无越权读他人带货数据问题。 | 通过 | 无。 |

---

### 1.3 管理后台：`/main/admin/*`、`/api/admin/*`

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 普通用户是否无法访问管理后台页面 | **通过**：所有审计到的 admin 页面均在服务端校验 `profile.role === 'admin'` 或 `profile.role` 为 `admin`/`support`（如 dashboard、reports、profile-review、review、platform-fees、support、platform-payment-accounts、payment-accounts、seller-debts、violation-penalties、orders、disputes 等），非管理员/支持重定向至 `/`。 | 通过 | 无。 |
| 普通用户是否无法访问管理后台 API | **通过**：所有 `/api/admin/*` 路由均使用 `requireAdmin` 或 `requireAdminOrSupport`（或等价的手动 `profile.role !== 'admin' && !== 'support'`），未通过时返回 401/403。 | 通过 | 无。 |
| 管理员操作是否有全权限记录和限制 | **部分**：权限限制到位（仅 admin/support 可访问）；**审计日志覆盖不全**：已对「结算佣金、处理退款、保证金处理退款」等做 `logAudit`，但以下管理员敏感操作**未**发现统一审计日志：收款账户验证、纠纷处理、违规扣款、平台费用扣款、平台收款账户 CRUD、卖家债务处理、转账重试、监控大盘、补偿、资料审核通过/拒绝。 | **中** | 对上述管理员敏感操作补充 `logAudit`（操作类型、操作人、资源 ID、结果、时间），不记录敏感详情；可复用 `@/lib/api/audit`。 |

---

### 1.4 订阅管理：`/main/subscription/*`、`/api/subscriptions/*`

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 订阅页面访问控制 | **部分**：`/subscription/manage` 等页仅依赖 `useAuth()` 与查询 `enabled: !!user`，**未在未登录时重定向**。未登录用户会看到 loading 后空状态或「您还没有订阅」等，可能暴露订阅入口。 | **低** | 在订阅管理页（及订阅支付入口页）增加「未登录则重定向到登录页」逻辑（如 `useEffect` 检查 `!user && !loading` 则 `router.push('/login?redirect=...')`）。 |
| 订阅 API 权限 | **通过**：`/api/subscriptions/create-pending`、`/api/subscriptions/create-payment` 要求登录（401）；`/api/subscriptions/history` 仅返回 `user_id = user.id` 的订阅记录，无越权。 | 通过 | 无。 |

---

## 2. 前端与后端一致性

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 前端隐藏/禁用的操作，后端是否仍校验权限 | **通过**：关键能力均以 API 或 Supabase RLS/服务端校验为准。例如：带货创建推广由 API 校验订阅；卖家收款账户由 API 校验 `checkSellerPermission` 与 `seller_id`；管理员操作均由 `requireAdmin`/角色校验。前端隐藏/禁用不会降低后端安全性。 | 通过 | 无。 |
| API 是否有严格权限校验，避免前端绕过 | **通过**：管理员接口统一 `requireAdmin`/`requireAdminOrSupport`；卖家收款账户与保证金等使用 `checkSellerPermission` 或 `seller_id` 归属校验；带货创建使用 RPC 校验订阅；订单发货/取消/确认收货/纠纷等均校验买方/卖方/管理员身份。未发现仅依赖前端、可被直接调 API 绕过的权限漏洞。 | 通过 | 保持；新增角色相关 API 时继续统一使用 `requireAdmin` 或相应角色/资源归属校验。 |

---

## 3. 敏感操作安全

| 操作类型 | 角色/归属校验 | 操作日志 | 风险等级 | 修复建议 |
|----------|----------------|----------|----------|----------|
| 变更收款账户（卖家） | **有**：`/api/payment-accounts` GET/POST 使用 `checkSellerPermission`；PUT/DELETE/set-default 校验 `account.seller_id === user.id`。 | **有**：已有 `logAudit`（创建/更新/删除/设默认）。 | 通过 | 无。 |
| 发起退款（管理员） | **有**：`/api/admin/refunds/process` 使用 `requireAdmin`。 | **有**：`logAudit`。 | 通过 | 无。 |
| 结算佣金（管理员） | **有**：`/api/admin/commissions/[id]/settle` 使用 `requireAdmin`。 | **有**：`logAudit`。 | 通过 | 无。 |
| 修改订单状态（发货/确认收货/取消/纠纷） | **有**：发货校验 `order.seller_id === user.id`；取消校验买方/卖方/管理员；确认收货校验买方；纠纷发起校验买方/卖方；纠纷回应校验卖方。 | 部分接口有业务日志，未要求统一审计格式。 | **低** | 可选：对订单状态变更（尤其取消、纠纷）增加统一 `logAudit`，便于审计与纠纷追溯。 |
| 管理员：收款账户验证、纠纷处理、违规扣款、平台费用、平台收款账户、卖家债务、转账重试、资料审核 | **有**：均为 `requireAdmin` 或 admin/support 角色校验。 | **部分**：多数**未**使用 `logAudit`，仅部分有 `console.error`。 | **中** | 为上述管理员敏感操作补充 `logAudit`（见 1.3）。 |

---

## 4. 异常访问处理

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 非法访问页面时是否返回安全错误 | **通过**：未登录访问需登录页时重定向到登录；非管理员访问 admin 页重定向到 `/`；非卖家访问他人产品编辑重定向到卖家产品列表。未发现直接返回 403 页面泄露内部结构。 | 通过 | 无。 |
| 非法访问接口时是否返回 401/403 且不泄露数据 | **通过**：`requireAdmin`/`requireAdminOrSupport` 返回 401（未登录）或 403（无权限），文案为 "Unauthorized" / "Unauthorized: Admin access required" 等，无堆栈或内部信息。其他 API 未授权时同样返回 401/403 及通用错误信息。 | 通过 | 无。 |

---

## 5. 日志与追踪

| 检查点 | 发现问题 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 关键权限操作是否记录日志 | **部分**：管理员结算佣金、处理退款、保证金处理退款已有 `logAudit`；管理员收款账户验证、纠纷处理、违规扣款、平台费用、平台收款账户、卖家债务、转账重试、监控、补偿、资料审核等**未**使用统一审计日志。 | **中** | 对 1.3 所列管理员敏感操作补充 `logAudit`，并约定不记录密码、完整卡号等敏感信息。 |
| 日志中是否有敏感信息泄露风险 | **低**：现有 `logAudit` 与 `console.error` 未发现记录密码、完整支付凭据；错误日志多为 `error.message` 或请求上下文。 | **低** | 规范：审计日志与错误日志不记录 token、完整卡号、密码；若需记录订单/用户标识，仅记录 ID 或脱敏信息。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | 卖家页面角色校验 | 仅校验登录，未校验卖家角色/订阅，任何已登录用户可打开卖家页 | 低 | 可选：布局或关键页校验卖家身份并重定向 |
| 2 | 产品创建 RLS | RLS 不校验卖家订阅，仅校验 active + seller_id=auth.uid()，理论上可绕过前端插待审核商品 | 低 | 若业务要求「仅订阅卖家可创建」，需在触发器或统一 API 中校验订阅 |
| 3 | 带货页面角色校验 | 仅校验登录，未订阅用户可打开带货页（创建会被 API 拒绝） | 低 | 可选：入口/布局校验带货订阅并重定向 |
| 4 | 管理员敏感操作审计日志 | 收款账户验证、纠纷、违规扣款、平台费用、平台账户 CRUD、卖家债务、转账重试、监控、补偿、资料审核等无统一 logAudit | 中 | 为上述操作补充 logAudit，不记录敏感字段 |
| 5 | 订阅管理页未登录重定向 | `/subscription/manage` 未登录时未重定向，仅空状态/loading | 低 | 未登录时重定向到登录页并带 redirect |
| 6 | 订单状态变更审计 | 订单取消、纠纷等无统一审计日志 | 低 | 可选：对关键订单状态变更增加 logAudit |

---

## 7. 已采用的正确实践（无需修改）

- **管理员 API**：统一使用 `requireAdmin` / `requireAdminOrSupport`，返回 401/403，无数据泄露。
- **管理员页面**：服务端统一校验 `profile.role`（admin/support），非权限用户重定向至首页。
- **卖家收款账户**：`checkSellerPermission` + `seller_id` 归属校验 + 审计日志。
- **带货创建**：API 侧 RPC 校验带货订阅，前端无法绕过。
- **订单/纠纷**：发货、取消、确认收货、纠纷发起/回应均做买方/卖方/管理员身份校验。
- **产品与收款账户**：RLS 与 API 均限制为「本人数据」，无越权读/写他人卖家数据。

---

## 8. 修复计划执行状态

| 优先级 | 检查点 | 风险等级 | 状态 | 说明 |
|--------|--------|----------|------|------|
| P1 | 管理员敏感操作审计日志 | 中 | ✅ 已完成 | 已为收款账户验证、纠纷处理、违规扣款、平台费用、平台账户 CRUD、卖家债务、转账重试、补偿、资料审核（通过/拒绝）补充 `logAudit`；监控大盘为只读，未加审计。 |
| P2 | 卖家页面访问控制 | 低 | ✅ 已完成 | 新增 `(main)/seller/layout.tsx`，使用 `useSellerGuard({ redirectTo: '/subscription/seller' })`，非卖家订阅用户访问任意卖家页时重定向至卖家订阅页。 |
| P2 | 带货页面访问控制 | 低 | ✅ 已完成 | 在 `/affiliate/products/[id]/promote` 增加 `useEffect`：当已登录且 profile 已加载且无有效带货订阅时重定向至 `/subscription/affiliate`。 |
| P2 | 订阅管理页未登录重定向 | 低 | ✅ 已完成 | `/subscription/manage` 增加 `useEffect` 未登录时重定向至 `/login?redirect=...`，并增加早期返回避免闪内容。 |
| P3 | 产品创建订阅校验 | 低 | 未做 | 可选：需在 DB 触发器或统一产品创建 API 中校验卖家订阅，当前 RLS 仅校验 active + seller_id。 |
| P3 | 订单状态变更审计 | 低 | ✅ 已完成 | 已为 `POST /api/orders/[id]/cancel`、`POST /api/orders/[id]/dispute`（创建纠纷）、`POST /api/orders/[id]/dispute/respond` 增加 `logAudit`（action: order_cancel / dispute_open / dispute_respond）。 |

---

**审计结论**：角色与资源归属校验整体到位，未发现可被前端绕过的高危漏洞；主要改进点为**管理员敏感操作审计日志覆盖不全**（中风险）及若干低风险的页面级角色/登录重定向与可选的产品创建订阅校验、订单审计日志。
