# 客服与工单系统 — 审计报告

**审计范围**：工单创建/查看/更新/回复、列表与详情、权限、输入校验、异常与日志、数据一致性  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 工单创建与访问

**页面与接口**：`/main/support/tickets`、`/main/support/tickets/create`；无独立 `/api/support/*`，工单与回复均通过 Supabase 客户端直连 DB，由 RLS 控制权限。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户只能创建自己的工单 | **通过**：创建页使用 `user_id: user.id`（useAuth）；RLS `support_tickets` INSERT 为 `WITH CHECK (auth.uid() = user_id)`，无法以他人身份创建。 | 通过 | 无。 |
| 用户只能查看自己提交的工单 | **通过**：用户列表页查询 `.eq('user_id', user.id)`；详情页服务端先拉工单再校验 `isOwner \|\| isAdminOrSupport`，否则 redirect；RLS SELECT 仅允许 `user_id = auth.uid() OR assigned_to = auth.uid() OR admin/support`。 | 通过 | 无。 |
| 工单提交内容是否经过输入校验（防 XSS/注入） | **部分**：`title`、`description` 为用户输入，**未**做 sanitize，存在 XSS 风险；`ticket_type`、`priority` 为前端 select 固定值，注入风险低。 | **中** | 创建工单前对 `title`、`description` 调用 `sanitizeContent` 并做长度限制（如 title 200、description 5000）；写入 DB 前使用 sanitize 后内容。 |

---

## 2. 工单列表与详情

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户列表仅显示自己相关工单 | **通过**：`/support/tickets` 查询 `.eq('user_id', user.id)`，RLS 同样限制 SELECT。 | 通过 | 无。 |
| 管理员/客服列表显示权限正确 | **通过**：`/admin/support` 页要求 `profile.role in ('admin','support')`，否则 redirect；AdminSupportClient 查询 `support_tickets` 全表，RLS 允许 admin/support SELECT 全部。 | 通过 | 无。 |
| 工单状态更新（处理中、已解决、关闭）权限校验 | **通过**：RLS 中 UPDATE 仅允许 (1) 用户更新自己的工单 `user_id = auth.uid()` (2) admin/support 更新任意 (3) assigned_to 更新被分配工单；状态按钮仅在 AdminSupportClient 中展示，仅 admin/support 可访问该页。 | 通过 | 无。 |

---

## 3. 工单回复与操作

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户只能回复自己的工单 | **通过**：RLS `support_ticket_replies` INSERT 要求工单 `user_id = auth.uid() OR assigned_to = auth.uid() OR 当前用户为 admin/support`，仅工单主、被分配客服、管理员可回复。 | 通过 | 无。 |
| 客服/管理员操作权限正确 | **通过**：同上 RLS；分配工单、改状态仅在 AdminSupportClient，且页面入口已校验角色。 | 通过 | 无。 |
| 回复内容是否安全，日志中不泄露敏感信息 | **部分**：回复插入时 `content` **未**做 sanitize，存在 XSS 风险；当前无工单/回复的 logAudit，若后续加日志需不记录内容原文。 | **中** | 回复写入前对 `content` 调用 `sanitizeContent` 并做长度限制（如 5000）；新增审计日志时不记录 title/description/content 原文。 |

---

## 4. 异常处理与日志

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 异常操作、非法访问是否有日志 | **部分**：创建失败、回复失败仅 `console.error`，未调用 logAudit；非法写由 RLS 拒绝，但无审计记录。 | **低** | 可选：工单创建成功/失败、回复成功/失败、管理员状态/分配变更时调用 logAudit（action、userId、resourceId、resourceType、result），不记录内容原文。 |
| 日志中敏感数据是否安全 | **通过**：当前无工单结构化审计日志；若有日志需遵循现有规范（不记录 account_info、密码、内容原文）。 | 通过 | 保持规范。 |
| 工单删除或状态修改操作是否可追踪 | **部分**：工单无删除功能；状态/分配变更在 DB 与通知触发器中有体现，但**无** logAudit，不可从审计表追溯。 | **低** | 可选：AdminSupportClient 状态/分配变更成功后调用 API 或服务端逻辑记录 logAudit。 |

---

## 5. 数据一致性

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 工单状态、回复记录是否与前端显示一致 | **通过**：列表/详情/回复均从 Supabase 实时查询，无本地状态覆盖；详情页 initialData 与 refetch 一致。 | 通过 | 无。 |
| 多端操作是否同步正确 | **通过**：同一数据源，刷新或 invalidateQueries 后即同步；状态变更、回复有 DB 触发器通知。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | 工单 title/description 未 sanitize | 创建工单时用户输入未做 XSS 过滤 | **中** | 创建前对 title、description 调用 sanitizeContent，并做长度限制 |
| 2 | 回复 content 未 sanitize | 回复内容未做 XSS 过滤 | **中** | 回复写入前对 content 调用 sanitizeContent，并做长度限制 |
| 3 | 工单/回复无审计日志 | 创建失败、回复、状态变更无 logAudit | **低** | 可选：关键操作成功/失败记录 logAudit（不记录内容原文） |
| 4 | 状态/分配变更无可追溯审计 | 仅 DB 与通知，无审计表追溯 | **低** | 可选：状态/分配变更时记录 logAudit |

---

## 7. 已采用的正确实践（无需修改）

- **创建**：user_id 来自 useAuth，RLS 强制 INSERT 仅限本人。
- **列表**：用户侧 `.eq('user_id', user.id)`；管理侧角色校验 + RLS 允许 admin/support 查全部。
- **详情**：服务端校验 isOwner \|\| isAdminOrSupport 后渲染 TicketDetailClient；RLS 再次限制 SELECT。
- **回复**：RLS 限制 INSERT 为工单主/被分配客服/admin/support；TicketDetailClient 使用当前 user.id。
- **状态/分配**：仅 admin/support 可访问管理页；RLS UPDATE 三条策略明确，普通用户无法改他人工单状态。
- **数据一致性**：单一数据源、实时查询与 invalidateQueries，触发器负责通知。

---

**审计结论**：工单与回复的权限、RLS、列表/详情/管理页访问控制及数据一致性良好；**主要改进点**为 **工单创建与回复的用户输入做 sanitize 与长度限制**（中），以及可选的 **关键操作 logAudit**（低）。建议优先完成创建/回复的 sanitize 防 XSS。

---

## 8. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | 工单 title/description 未 sanitize | **已修复**：`/support/tickets/create` 提交前对 `title`、`description` 调用 `sanitizeContent`；增加长度限制（title 200、description 5000）；`ticket_type`、`priority` 白名单校验；新增翻译键 ticketTitleAndDescriptionRequired、ticketTitleTooLong、ticketDescriptionTooLong。 |
| 2 | 回复 content 未 sanitize | **已修复**：`TicketDetailClient` 回复写入前对 `content` 调用 `sanitizeContent`，长度限制 5000；提交按钮在超长时禁用。 |
