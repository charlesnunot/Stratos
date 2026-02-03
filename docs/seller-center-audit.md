# 审计任务 27：卖家中心（Seller）

**目标**：确保卖家操作安全可靠、权限正确、数据一致，防止越权操作或财务异常。

**审计日期**：2025-01-31

---

## 1. 仪表盘与数据展示

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 数据（订单量、销售额、流量）与后端统计一致 | 仪表盘从 orders/products 表按 seller_id = user.id 聚合；商品数、订单数、已完成销售额、待发货、近 7 日销售额均由 Supabase 查询，与 DB 一致。 | 无 | 已满足 |
| 仪表盘只显示当前卖家的数据 | 所有查询均 .eq('seller_id', user.id)；useSellerGuard 保证仅卖家可进入卖家区。 | 无 | 已满足 |
| 异常或缺失数据是否有处理 | 使用 Promise.allSettled，单条失败不抛错，部分数据仍可显示；**问题**：rejected 时 console.error 会输出 reason，生产环境可能泄露内部信息。 | **低** | **已修复**：仅在 NODE_ENV === 'development' 时输出上述 console.error。 |

---

## 2. 商品管理

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 卖家只能管理自己的商品 | 列表 .eq('seller_id', user.id)；编辑页加载商品 .eq('id', productId).eq('seller_id', user.id).single()；删除 .eq('seller_id', user!.id)；RLS「Sellers can update own products」等限制 seller_id。 | 无 | 已满足 |
| 创建/编辑/删除商品权限校验 | 卖家 layout 使用 useSellerGuard，非卖家重定向；创建/编辑/删除均带 seller_id 或由 RLS 约束；删除成功时 logAudit(delete_product)。 | 无 | 已满足 |
| 商品状态与库存更新逻辑正确 | 商品状态与库存由 Supabase 更新，RLS 限制仅本人或 admin/support；触发器与业务逻辑在订单/支付流程中维护。 | 无 | 已满足 |

---

## 3. 订单管理

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 卖家只能查看和操作自己商品相关订单 | 卖家订单页 .eq('seller_id', user.id)；发货 API 校验 order.seller_id === user.id；取消/纠纷/确认收货 API 校验 buyer 或 seller 或 admin。 | 无 | 已满足 |
| 发货、物流更新权限校验 | /api/orders/[id]/ship：校验 order.seller_id === user.id，checkSellerPermission；仅已支付订单可发货；logAudit(ship_order)。 | 无 | 已满足 |
| 异常订单（退货、纠纷）处理逻辑安全 | 纠纷创建/回复 API 校验 order.buyer_id / order.seller_id；dispute 表 initiated_by_type 区分 buyer/seller；logAudit(dispute_open 等)。 | 无 | 已满足 |
| 发货 API params（Next 15） | **问题**：动态路由 params 在 Next 15 为 Promise，未 await 时 params.id 可能异常。 | **中** | **已修复**：POST 使用 params: Promise<{ id: string }> 并 const { id: orderId } = await params，缺省返回 400；后续逻辑使用 orderId。 |

---

## 4. 收款账户与保证金

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 卖家只能操作自己的收款账户和保证金 | /api/payment-accounts GET 校验 checkSellerPermission，查询 .eq('seller_id', user.id)；payment_accounts 表 RLS 限制本人；保证金按 seller 维度在 deposit 相关 API 中校验。 | 无 | 已满足 |
| 支付和退款逻辑正确 | 支付走 Stripe/支付宝等；退款与保证金逻辑在 deposits、payments 等 API 与 RPC 中，与订单/账户状态一致。 | 无 | 已满足 |
| 异常操作可追踪和回滚 | 支付/退款相关有 logAudit 或 payment logger；失败不写库或标记失败状态，可追踪。 | 无 | 已满足 |

---

## 5. 分析与其他功能

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 数据分析准确 | analytics 页从 orders 按 seller_id = user.id、时间范围聚合；数据来源与仪表盘一致。 | 无 | 已满足 |
| 设置权限校验 | affiliate-settings 使用 useAuthGuard；商品列表 .eq('seller_id', user.id)；更新 .eq('seller_id', user!.id)。policies、deposit 等页在卖家 layout 下，由 useSellerGuard 保护。 | 无 | 已满足 |
| 配置更改有日志 | 商品删除、发货、纠纷等有 logAudit；收款账户增删改经 API，可结合现有审计与 RLS 追溯。 | 低 | 已满足 |

---

## 6. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 关键操作有日志记录 | 发货、取消、纠纷、商品删除等已调用 logAudit（action、userId、resourceId、result）；支付/打赏有 payment logger。 | 无 | 已满足 |
| 异常操作可回滚 | 写库失败返回错误，前端 toast；支付/退款失败不写成功状态；无单方面提交后无法回滚的设计。 | 无 | 已满足 |
| 日志中不泄露敏感信息 | logAudit 不记录正文、金额明细、account_info；仪表盘统计失败时的 console.error 已改为仅开发环境输出。 | 无 | 已满足 |

---

## 修复项汇总

| 项 | 文件 | 说明 |
|----|------|------|
| 1 | `src/app/[locale]/(main)/seller/dashboard/page.tsx` | 统计查询 rejected 时的 console.error 改为仅在 NODE_ENV === 'development' 时输出 |
| 2 | `src/app/api/orders/[id]/ship/route.ts` | POST 使用 params: Promise<{ id: string }> 并 await params，使用 orderId；缺省 orderId 返回 400 |

---

## 涉及页面与接口

- **仪表盘**：/main/seller/dashboard（useSellerGuard；stats 按 seller_id 聚合）。
- **商品**：/main/seller/products、/seller/products/create、/seller/products/[id]/edit（列表/编辑/删除均 seller_id 或 RLS）。
- **订单**：/main/seller/orders（.eq('seller_id', user.id)）；/api/orders/[id]/ship、cancel、confirm-receipt、dispute、dispute/respond（校验 buyer/seller/admin）。
- **收款与保证金**：/main/seller/payment-accounts、/seller/deposit/*；/api/payment-accounts（checkSellerPermission + seller_id）。
- **分析与设置**：/main/seller/analytics、/seller/affiliate-settings、/seller/policies（均在卖家 layout 下，数据按 user.id/seller_id）。
