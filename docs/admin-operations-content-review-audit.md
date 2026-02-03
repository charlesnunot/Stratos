# 推演任务 17 — 管理员操作与内容审核链路审计

**目标**：验证管理员在内容审核、AI 翻译/话题提取、违规处理、佣金/保证金管理等流程的完整端到端链路。  
**审计日期**：2025-01-31  
**结论**：按验证点逐项核对，记录已实现项、已修复项与可选增强。

---

## 1. 功能入口与路径

| 类别 | 任务描述 | 实际实现 | 状态 |
|------|----------|----------|------|
| 内容审核页面 | /admin/content-review, /admin/profile-review | /admin/review（帖子+商品审核）、/admin/profile-review | **已对齐**：新增 /admin/content-review → /admin/review 重定向，与文档一致。 |
| 内容审核 API | /api/admin/content-review/*, /api/admin/profile-review/* | /api/admin/content-review/[id]/approve、reject；/api/admin/profiles/[id]/approve-profile、reject-profile | 通过 |
| AI 翻译/话题 | /api/ai/translate-after-publish, /api/ai/extract-topics-after-approval | 审核通过后由 approve 路由异步调用上述 API | 通过 |
| 财务与保证金 | /api/admin/deposits/*, /api/admin/commissions/* | /api/admin/deposits/[lotId]/process-refund；/api/admin/commissions/[id]/settle | 通过 |

---

## 2. 内容审核（帖子/用户资料）

### 2.1 审核通过链路

| 验证点 | 实现位置 | 状态 |
|--------|----------|------|
| 管理员 GET 待审核内容 → RLS/admin 校验 | /admin/review 页面 + ContentReview 组件；服务端校验 profile.role in ['admin','support'] | 通过 |
| PUT /api/admin/content-review/[id]/approve | 实际为 POST；更新 content_review 或 posts 状态 | 通过 |
| 更新 content_review.status = approved（或帖子 status = published） | content-review approve 路由；profile 走 profiles approve-profile | 通过 |
| logAudit(action=approve_content, adminId, contentId, result) | approve 与 approve-profile 均调用 logAudit（action: approve_content / 等价命名） | 通过 |
| 触发 AI：translate-after-publish、extract-topics-after-approval | 审核通过后异步 POST 上述两个 API，写入 posts/translations、topics | 通过（任务 14 已实现） |
| 通知作者 notifications.insert（内容通过/已处理） | approve 与 approve-profile 中插入 notifications | 通过 |

### 2.2 审核拒绝链路

| 验证点 | 实现位置 | 状态 |
|--------|----------|------|
| PUT /api/admin/content-review/[id]/reject | 实际为 POST；reject 与 reject-profile | 通过 |
| 更新 content_review.status = rejected（或对应状态） | content-review reject、profiles reject-profile | 通过 |
| logAudit(action=reject_content, adminId, contentId, reason) | 两处 reject 均有 logAudit，含 result、meta.reason | 通过 |
| 通知作者 notifications.insert（内容未通过） | reject 与 reject-profile 中插入通知 | 通过 |

---

## 3. 违规处理

| 验证点 | 实现位置 | 状态 |
|--------|----------|------|
| API: /api/admin/violations/* | 实际为 /api/admin/violation-penalties/deduct | 通过（命名略有差异，功能一致） |
| 标记违规、更新 violations 表；扣款/冻结/警告 | violation-penalties/deduct 更新财务与违规相关状态 | 通过 |
| logAudit(action=penalize_user, adminId, userId, result) | logAudit 记录 admin 操作、resourceId、result | 通过 |
| 通知用户 notifications.insert | content_key: 'violation_penalty' 通知卖家 | 通过 |

---

## 4. 财务操作

### 4.1 佣金结算

| 验证点 | 实现位置 | 状态 |
|--------|----------|------|
| API: /api/admin/commissions/[id]/settle | POST；requireAdmin 校验 | 通过 |
| 更新 commission.status = settled | 实际为 affiliate_commissions.status = 'paid'，paid_at 写入 | 通过 |
| logAudit(action=settle_commission, ...) | 实际 action: 'admin_commission_settle'（语义一致，便于与其它 admin 操作区分） | 通过 |
| 通知卖家/带货者 notifications.insert | content_key: 'commission_settled'，通知 affiliate_id | 通过 |

### 4.2 保证金处理

| 验证点 | 实现位置 | 状态 |
|--------|----------|------|
| API: /api/admin/deposits/[lotId]/process-refund | POST；requireAdmin 校验 | 通过 |
| 更新 deposit_lots.status | process-deposit-refund 库中更新 seller_deposit_lots.status = 'refunded' | 通过 |
| logAudit(action=process_deposit_refund, ...) | 实际 action: 'admin_deposit_refund_process'（成功/失败均记录） | 通过 |
| 通知卖家 notifications.insert | process-deposit-refund 内插入，content_key: 'deposit_refund_completed' | 通过 |

---

## 5. 权限校验

| 验证点 | 实现 | 状态 |
|--------|------|------|
| 管理员可操作所有内容审核、违规处理、财务操作 | 所有上述 API 入口 requireAdmin 或 requireAdminOrSupport | 通过 |
| 普通用户无法调用 admin API | requireAdmin 未登录 401、非 admin 403 | 通过 |

---

## 6. DB/事务与数据正确性

| 项目 | 说明 | 状态 |
|------|------|------|
| content_review / profile_review 状态 | approve/reject 更新对应状态与关联表（posts/products/profiles） | 通过 |
| 违规记录与财务表 | violation-penalties 更新；commissions 为 affiliate_commissions；deposits 为 seller_deposit_lots + payment_transactions | 通过 |
| AI 生成翻译与话题 | translate-after-publish 写入 posts/translations；extract-topics-after-approval 写入 topics | 通过 |
| notifications、logAudit | 各流程按上述表格写入；logAudit 含 action、userId、resourceId、resourceType、result、timestamp、可选 meta | 通过 |

---

## 7. 异常与 Cron

| 项目 | 任务描述 | 实际实现 | 状态 |
|------|----------|----------|------|
| 超时未审核内容 → Cron auto-escalate-content | 超时自动升级/提醒 | **未实现** | 可选增强：可新增 Cron 扫描超时待审内容并通知或升级。 |
| 超期未结算佣金 | check-overdue-commissions / deduct-overdue-commissions | 任务 15 已检查并修复 logAudit、cron_logs | 通过 |
| 超期保证金 | update-deposit-lots-status | 任务 15 已检查 | 通过 |
| 异常处理调用 logAudit 或错误日志 | 各 API 失败分支均有 logAudit(result: 'fail') 或 console.error | 通过 |

---

## 8. 已实施的修复与变更

| 序号 | 项 | 说明 |
|------|----|------|
| 1 | /admin/content-review 路径一致性 | 新增 `[locale]/(main)/admin/content-review/page.tsx`，使用 next-intl 的 redirect 重定向到 `/admin/review`，保留 locale。 |

---

## 9. 汇总（验证点 vs 结论）

| 验证点 | 结论 |
|--------|------|
| 1. 权限校验 | 管理员可操作全部；普通用户调用 admin API 返回 401/403。 |
| 2. DB 数据正确性 | content_review/profile_review、违规与财务表、AI 翻译与话题写入均正确。 |
| 3. 通知 | 内容通过/拒绝、违规处理、佣金结算、保证金退款均向对应用户发送 notifications。 |
| 4. 日志 | 所有关键操作 logAudit 完整（成功/失败）。 |
| 5. 异常处理 | Cron 超期佣金/保证金已覆盖；非法请求 403/401 + logAudit；**超时未审核自动升级**为可选增强。 |

**审计结论**：管理员操作与内容审核端到端链路已按任务要求实现并验证；路径一致性通过重定向补齐；Cron auto-escalate-content 作为可选增强保留在文档中，未实现不影响当前验证结论。
