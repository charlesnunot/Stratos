# 带货（Affiliate）模块审计报告

**审计目标**：确保带货商品管理、推广操作和数据统计功能安全、权限正确、数据准确，防止数据篡改或越权操作。  
**审计日期**：2025-01-31  
**范围**：页面 `/main/affiliate/products`、`/affiliate/products/[id]/promote`、`/main/affiliate/stats`；接口 `/api/affiliate/posts/create`、`/api/admin/commissions/[id]/settle`；表 `affiliate_posts`、`affiliate_products`、`affiliate_commissions` 及 RLS。

---

## 1. 带货商品管理

**页面与接口**：`/main/affiliate/products`、`/affiliate/products/[id]/promote`；`/api/affiliate/posts/create`。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 用户只能推广自己有权限的商品 | **通过**：推广页与 API 均校验带货订阅（`check_subscription_status(p_subscription_type: 'affiliate')`）；API 校验商品 `allow_affiliate`，仅允许推广开放带货的商品。 | 通过 | 无。 |
| 推广设置（价格、折扣、推广状态）权限校验 | **通过**：价格与佣金来自商品表（服务端读取），用户不可修改；推广状态由帖子审核与 `affiliate_posts`/`affiliate_products` 写入，仅当前用户且订阅有效时可创建。 | 通过 | 无。 |
| 商品状态与数据库同步一致 | **通过**：商品列表与推广页从 Supabase 查询 `products`（含 RLS）；API 创建推广时再次读取商品并校验 `allow_affiliate`。 | 通过 | 无。 |
| 推广内容与图片长度/数量校验 | **问题**：API 未对 `content`、`images` 数量、`location` 做长度/数量限制，存在滥发与存储风险。 | **中** | **已修复**：API 增加 content 必填与最长 10000 字符、最多 9 张图、location 最长 200 字符。 |
| affiliate_products 表无 RLS 策略 | **问题**：`affiliate_products` 仅启用 RLS 无策略，默认拒绝所有操作；API 使用用户 JWT 插入会失败或依赖其他路径。 | **高** | **已修复**：新增迁移 `194_affiliate_products_rls.sql`，SELECT 允许所有人（展示佣金用），INSERT 仅允许 `affiliate_id = auth.uid()` 且 profiles.subscription_type = 'affiliate'。 |

---

## 2. 带货数据统计

**页面与接口**：`/main/affiliate/stats`（仅前端 Supabase 查询，无独立统计 API）。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 数据统计（点击量、成交量、收益）准确 | **通过**：收益与订单数来自 `affiliate_commissions` 按 `affiliate_id = user.id` 聚合；带货帖子数来自 `affiliate_posts` 同条件 count；计算逻辑清晰。 | 通过 | 无。 |
| 统计数据只显示当前用户相关信息 | **通过**：所有查询均 `.eq('affiliate_id', user.id)`；RLS「Users can view own commissions」限制 `affiliate_commissions` 仅本人或 admin。 | 通过 | 无。 |
| 异常或延迟数据处理逻辑正确 | **通过**：使用 `??`/`||` 处理空值与缺省；图表按日期聚合，无异常分支遗漏。 | 通过 | 无。 |
| 统计页硬编码中文与固定货币符号 | **问题**：文案「待结算」「带货帖子」「近7天佣金收入」「已结算/待结算/已取消」「暂无收益记录」「订单」「商品」及金额「¥」为硬编码。 | **低** | **已修复**：文案改为 `t('pendingSettlement')` 等 i18n；金额使用 `formatCurrency(..., 'CNY')`。 |

---

## 3. 权限与安全

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 用户无法修改他人推广商品或数据 | **通过**：创建推广帖仅写入当前 user 的 post / affiliate_post / affiliate_products；`affiliate_posts` RLS「Affiliates can create affiliate posts」要求 `affiliate_id = auth.uid()` 且订阅为 affiliate；`affiliate_products` 新策略同上。 | 通过 | 无。 |
| 后端接口严格校验身份和权限 | **通过**：`/api/affiliate/posts/create` 要求登录 + RPC 校验带货订阅 + 商品存在且 `allow_affiliate`；`/api/admin/commissions/[id]/settle` 使用 `requireAdmin`。 | 通过 | 无。 |
| 防止恶意请求或越权操作 | **通过**：content/images/location 已做长度与数量校验；商品 id 由请求体传入但仅用于查询与关联，不信任前端金额。 | 通过 | 已加强：见 1.1 内容/图片/地点校验。 |

---

## 4. 异常处理与日志

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 异常推广操作或接口调用有日志 | **通过**：创建推广帖成功时调用 `logAudit({ action: 'create_affiliate_post', ... })`；失败分支有 `console.error`。 | 通过 | 无。 |
| 日志中不泄露敏感信息 | **问题**：API 与推广页在失败时直接 `console.error` 完整 error，生产环境可能泄露内部信息。 | **低** | **已修复**：`/api/affiliate/posts/create` 与推广页、`/api/admin/commissions/[id]/settle` 的 `console.error` 仅在 `NODE_ENV === 'development'` 时输出。 |
| 系统异常不会导致收益或数据异常 | **通过**：创建 affiliate_post 失败时已回滚删除刚创建的 post；affiliate_products 插入失败仅记录日志不中断流程，佣金仍可从 product.commission_rate 计算。 | 通过 | 无。 |

---

## 5. 性能与稳定性

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 带货商品列表和数据统计加载速度合理 | **通过**：列表与统计使用 React Query + Supabase 索引（如 `idx_affiliate_posts_affiliate_id`、`idx_affiliate_commissions_affiliate_id`）；无 N+1。 | 通过 | 无。 |
| 高并发访问时数据一致性和接口稳定性 | **通过**：写入路径为「post → affiliate_post → affiliate_products」顺序且有关联约束；RLS 与唯一约束防止重复与越权。 | 通过 | 无。 |
| 管理端结算接口 params 兼容性 | **问题**：`/api/admin/commissions/[id]/settle` 使用同步 `params.id`，在 Next.js 15 中 params 可能为 Promise。 | **低** | **已修复**：改为 `params: Promise<{ id: string }>` 并 `const { id: commissionId } = await params`。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复状态 |
|------|--------|----------|----------|----------|
| 1 | affiliate_products 无 RLS | 表仅 RLS 开启无策略，INSERT 被拒 | **高** | ✅ 已修复（194_affiliate_products_rls.sql） |
| 2 | 推广 API 缺少输入校验 | content/images/location 无长度与数量限制 | **中** | ✅ 已修复（必填、10000 字、9 图、200 字 location） |
| 3 | 统计页硬编码与货币 | 中文文案与 ¥ 硬编码 | **低** | ✅ 已修复（i18n + formatCurrency） |
| 4 | 生产环境错误日志 | console.error 输出完整 error | **低** | ✅ 已修复（仅开发环境输出） |
| 5 | 管理结算 params | Next 15 params Promise 兼容 | **低** | ✅ 已修复（await params） |

---

## 7. 已采用的正确实践（无需修改）

- **推广页**：未登录重定向登录，无有效带货订阅重定向订阅页；前端再次校验订阅后调用 API。
- **API 创建推广**：校验订阅 RPC、商品存在且 `allow_affiliate`、写入 post 后写 affiliate_post，失败回滚 post；成功写 logAudit。
- **统计页**：所有查询按 `affiliate_id = user.id`，RLS 限制 affiliate_commissions 仅本人可见。
- **affiliate_posts RLS**：SELECT 全部可见，INSERT 仅 `affiliate_id = auth.uid()` 且订阅为 affiliate。
- **affiliate_commissions RLS**：SELECT 仅本人或 admin/support。

---

## 8. 涉及文件与变更

| 类型 | 路径 |
|------|------|
| 迁移 | `supabase/migrations/194_affiliate_products_rls.sql`（新增） |
| API | `src/app/api/affiliate/posts/create/route.ts`（校验 + 日志） |
| API | `src/app/api/admin/commissions/[id]/settle/route.ts`（params + 日志） |
| 页面 | `src/app/[locale]/(main)/affiliate/products/[id]/promote/page.tsx`（日志 + error 类型） |
| 页面 | `src/app/[locale]/(main)/affiliate/stats/page.tsx`（i18n + formatCurrency） |
| 文案 | `src/messages/zh.json`、`src/messages/en.json`（affiliate 新增键） |

---

**审计结论**：带货模块在权限与数据归属上设计正确；**已修复** affiliate_products 无 RLS、推广 API 输入校验、统计页国际化与货币展示、生产环境错误日志、管理结算 params 兼容性。修复后满足「安全、权限正确、数据准确、可追踪」的审计目标。
