# 审计任务 22：举报、审核与内容违规处理

**目标**：确保用户举报、内容审核、违规扣款、封禁等功能权限正确、安全，处理逻辑合理，数据一致。

**审计日期**：2025-01-31

---

## 1. 举报功能

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能举报他人内容，不能篡改或删除他人举报 | RLS 已保证：INSERT 仅 `auth.uid() = reporter_id`；UPDATE 仅 admin/support；无 DELETE 策略，用户无法删除举报。 | 无 | 已满足 |
| 举报内容记录完整（原因、时间、举报者 ID） | ReportDialog 写入 `reporter_id`、`reported_type`、`reported_id`、`reason`、`description`、`status`；`created_at` 由 DB 默认。 | 无 | 已满足 |
| 重复举报处理 | 迁移 102 已实现：60 秒内最多 10 次、同一内容 24 小时内最多 3 次。 | 无 | 已满足 |

---

## 2. 内容审核

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 审核员只能审核权限范围内内容 | 页面 /admin/review、/admin/profile-review 服务端校验 `role === 'admin' \|\| 'support'`；ContentReview 客户端再次校验角色；posts/products/comments RLS 允许 admin/support UPDATE。 | 无 | 已满足 |
| 审核状态更新（通过/驳回/封禁）逻辑正确 | 帖子/商品/评论通过或驳回后状态与触发器一致；profile 审核通过 approve-profile、驳回 reject-profile 使用 getSupabaseAdmin 并写审计。 | 无 | 已满足 |
| 审核结果及时同步到前端 | ContentReview 使用 queryClient.invalidateQueries 与 loadPendingContent 刷新；ProfileReviewClient 调用 router.refresh()。 | 无 | 已满足 |

---

## 3. 违规扣款与封禁

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 违规扣款仅限授权操作 | /api/admin/violation-penalties/deduct 使用 requireAdmin，仅管理员可调用。 | 无 | 已满足 |
| 用户封禁逻辑正确，无法绕过 | **问题**：ReportManagement 中对「用户」举报执行封禁时，使用客户端 `supabase.from('profiles').update({ status: 'banned' })`，而 profiles 的 RLS 仅允许「本人更新本人」；管理员无法通过客户端更新他人 profile，封禁从未生效。 | **高** | **已修复**：新增 POST /api/admin/profiles/[id]/ban，使用 getSupabaseAdmin 更新 status，requireAdminOrSupport + logAudit；ReportManagement 改为调用该 API。 |
| 财务扣款与订单/账户状态一致 | deduct 使用 deduct_from_deposit RPC，扣款失败时更新 violation 状态为 failed 并记录审计。 | 无 | 已满足 |
| 违规扣款入参校验 | **问题**：violationReason、violationType 未做长度与格式校验，存在超长或异常输入。 | **低** | **已修复**：violationReason trim + 最长 500 字符；violationType trim + 最长 50 字符，超限返回 400。 |

---

## 4. 数据一致性与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 审核、举报、扣款、封禁操作有完整日志 | 违规扣款、profile 审核通过/驳回、封禁 API 均调用 logAudit；举报的「处理/驳回/删除内容」为客户端直接改 DB，无统一审计（可接受，RLS 限制仅 admin 可更新 reports）。 | 低 | 封禁已通过 API 记录审计；举报处理若需审计可后续改为调用 API。 |
| 日志中敏感信息受保护 | logAudit 仅记录 action、userId、resourceId、resourceType、result、timestamp、meta；注释明确不记录密码、密钥、account_info。 | 无 | 已满足 |
| 多端操作数据同步一致 | 审核/封禁/扣款均为服务端操作，RLS 与 API 一致。 | 无 | 已满足 |

---

## 5. 异常处理

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 审核、举报或扣款异常时有回滚或告警 | 扣款失败时更新 violation 为 failed、记录审计并返回 400；审核/举报为单表更新，失败即返回错误。 | 无 | 已满足 |
| 系统异常不会导致用户误封或资金异常 | 封禁与扣款均需管理员权限；扣款使用 RPC 保证原子性；封禁 API 幂等（已封禁返回 400）。 | 无 | 已满足 |

---

## 修复项汇总

| 项 | 文件 | 说明 |
|----|------|------|
| 1 | `src/app/api/admin/profiles/[id]/ban/route.ts` | 新增封禁 API：requireAdminOrSupport + getSupabaseAdmin + logAudit |
| 2 | `src/components/admin/ReportManagement.tsx` | 封禁用户改为调用 POST /api/admin/profiles/[id]/ban |
| 3 | `src/app/api/admin/violation-penalties/deduct/route.ts` | violationReason/violationType trim + 长度校验（500/50） |

---

## 涉及页面与接口

- **举报**：/main/post/[id] 等使用 ReportDialog 提交；/main/admin/reports 使用 ReportManagement（admin 处理/驳回/删除内容/封禁用户）。
- **内容审核**：/main/admin/review（ContentReview）、/main/admin/profile-review（ProfileReviewClient）；/api/admin/profiles/[id]/approve-profile、reject-profile。
- **违规与封禁**：/api/admin/violation-penalties/deduct；/api/admin/profiles/[id]/ban（新增）；/main/banned。
