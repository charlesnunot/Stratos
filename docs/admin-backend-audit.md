# 管理后台（Admin）— 审计报告

**审计范围**：权限与访问控制、订单与纠纷管理、财务管理、平台监控与客服、日志与追踪  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 权限与访问控制

**页面与接口**：`/main/admin/*`、`/api/admin/*`。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 只有管理员角色可以访问后台页面和接口 | **通过**：① 页面侧：dashboard、disputes、platform-fees、platform-payment-accounts、payment-accounts、seller-debts、violation-penalties、monitoring 等均要求 `profile.role === 'admin'`，否则 redirect；orders、support、profile-review、review、reports 允许 `admin` 或 `support`。② API 侧：绝大多数使用 `requireAdmin(request)`（未登录 401，非 admin 403）；disputes GET 使用 `requireAdminOrSupport`；profiles approve/reject 使用 `getUser` + `profile.role in ['admin','support']`。 | 通过 | 无。 |
| 非管理员用户尝试访问是否返回安全错误（403/401） | **通过**：`requireAdmin` 未登录返回 401、非 admin 返回 403；页面未登录 redirect 登录、非权限用户 redirect('/')。 | 通过 | 无。 |
| 关键操作（退款、佣金结算、欠款处理、违规扣款）权限校验 | **通过**：`/api/admin/refunds/process`、`/api/admin/commissions/[id]/settle`、`/api/admin/seller-debts`（GET/POST）、`/api/admin/violation-penalties/deduct`、`/api/admin/deposits/[lotId]/process-refund` 均在入口调用 `requireAdmin(request)`，非 admin 无法执行。 | 通过 | 无。 |

---

## 2. 订单与纠纷管理

**页面与接口**：admin/orders、admin/disputes；`/api/admin/disputes`。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 管理员可查看所有订单/纠纷数据 | **通过**：orders 页与 disputes 页均要求 admin 或 support；disputes GET 使用 `requireAdminOrSupport`，使用当前用户 Supabase 客户端查询（admin 可查全部）；订单数据来自 API 或 Supabase，无按用户过滤。 | 通过 | 无。 |
| 状态变更逻辑正确、操作可追踪 | **通过**：disputes POST（解决纠纷）更新 dispute 状态、可选创建并执行退款，成功后调用 `logAudit({ action: 'dispute_process', ... })`；refunds/process 成功/失败均有 logAudit。 | 通过 | 无。 |
| 异常订单或纠纷处理是否有日志 | **部分**：纠纷解决成功有 logAudit；纠纷解决流程中若「创建退款后 processRefund 失败」仅 `console.error`，无 logAudit 记录部分失败，不利于追溯。 | **低** | 可选：disputes POST 中当 refund 执行失败时增加一次 logAudit（action: dispute_process 或 dispute_refund_fail，result: 'fail'，meta 含 disputeId/refundId）。 |

---

## 3. 财务管理

**页面与接口**：admin/platform-fees、admin/payment-accounts、admin/commissions、admin/refunds、admin/deposits（含 process-refund）、admin/seller-debts、admin/platform-payment-accounts。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 财务操作有权限控制 | **通过**：platform-fees/charge、payment-accounts/verify、platform-payment-accounts（GET/PATCH）、commissions/settle、refunds/process、deposits/[lotId]/process-refund、seller-debts（GET/POST）、violation-penalties/deduct、compensations、transfers/retry 均使用 `requireAdmin`（compensations POST 为手动 `profile.role === 'admin'`，效果一致）。 | 通过 | 可选：compensations POST 改为 `requireAdmin(request)` 与其它 API 风格统一。 |
| 数据正确性（金额、账户） | **通过**：各 API 有必填校验、金额 parse 与 >0 校验、订单/退款/佣金状态校验；退款与佣金结算使用统一 processRefund、affiliate_commissions 更新逻辑。 | 通过 | 无。 |
| 异常操作有回滚或告警 | **通过**：refunds/process、commissions/settle、violation-penalties/deduct、deposits/process-refund、seller-debts POST 等成功/失败均调用 logAudit；processRefund 等内部有状态更新与错误返回。 **已修复**：deposits/process-refund 失败分支中 `resourceId: lotId` 曾误用未定义变量，已改为 `params.lotId`。 | 通过 | 无。 |

---

## 4. 平台监控与客服

**页面与接口**：admin/monitoring/dashboard、admin/support。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 系统监控指标显示正确 | **通过**：monitoring/dashboard API 使用 `requireAdmin`，从 DB 聚合订单数、用户数、收入、待退款、纠纷、定时任务等；dashboard 页仅 admin 可访问，数据来源为该 API。 | 通过 | 无。 |
| 客服操作权限正确 | **通过**：admin/support 页要求 `profile.role in ['admin','support']`；工单列表、状态更新、分配依赖 Supabase RLS（admin/support 可查全部、可更新），与客服与工单系统审计一致。 | 通过 | 无。 |
| 敏感信息受保护 | **通过**：monitoring 返回聚合指标与健康状态，无单用户敏感明细；support 工单列表仅 admin/support 可访问，不向普通用户暴露。 | 通过 | 无。 |

---

## 5. 日志与追踪

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 关键操作（财务、用户权限变更、纠纷处理）有详细日志 | **通过**：refunds/process、commissions/settle、violation-penalties/deduct、deposits/process-refund、seller-debts（收债等）、disputes POST、profiles approve-profile/reject-profile、platform-fees/charge、payment-accounts/verify、platform-payment-accounts 等均在成功或失败时调用 `logAudit`（action、userId、resourceId、resourceType、result、可选 meta）。 | 通过 | 无。 |
| 日志中不泄露敏感信息 | **通过**：logAudit 仅记录 action、userId、resourceId、resourceType、result、timestamp 及有限 meta（如 orderId、reason、transactionId），不记录密码、完整支付信息、用户隐私字段。 | 通过 | 保持规范。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | deposits process-refund 失败日志 resourceId 错误 | 失败分支使用未定义变量 `lotId`，应为 `params.lotId` | **低** | **已修复**：resourceId 改为 params.lotId。 |
| 2 | 纠纷解决中退款失败无 logAudit | processRefund 失败仅 console.error，无审计记录 | **低** | 可选：退款执行失败时增加 logAudit。 |
| 3 | compensations POST 未使用 requireAdmin | 与其它 API 风格不一致，功能上仍为 admin only | **低** | 可选：改为 requireAdmin(request)。 |

---

## 7. 已采用的正确实践（无需修改）

- **统一鉴权**：绝大多数 `/api/admin/*` 使用 `requireAdmin` 或 `requireAdminOrSupport`，返回 401/403 明确。
- **页面分级**：财务、监控、违规、保证金、平台账户等仅 admin；订单、纠纷、客服、资料审核等支持 admin 或 support。
- **关键操作审计**：退款、佣金结算、违规扣款、保证金退款、欠款处理、纠纷解决、资料审核、平台费用、支付账户验证等均有 logAudit。
- **数据与状态**：金额与状态校验完整；失败时更新业务状态并记录审计，便于排查与合规。

---

## 8. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | deposits process-refund 失败日志 resourceId | **已修复**：`/api/admin/deposits/[lotId]/process-refund` 失败分支中 `logAudit` 的 `resourceId` 由错误使用的 `lotId` 改为 `params.lotId`。 |

---

**审计结论**：管理后台在权限控制、关键操作鉴权、财务与纠纷流程及审计日志方面整体良好；**仅发现一处低风险实现问题**（deposits process-refund 失败日志 resourceId 已修复），以及可选的纠纷退款失败 logAudit、compensations 统一使用 requireAdmin。建议保持现有权限与日志规范，按需采纳可选改进。
