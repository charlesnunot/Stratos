# 推演任务 16 — 支持工单与管理员操作全链路审计报告

## 审计概述

**任务**: 支持工单与管理员操作全链路测试 (Support Tickets & Admin Operations Full Linkage Test)  
**日期**: 2026-01-31  
**状态**: ✅ 全部问题已修复

---

## 功能入口与路径对应

| 任务描述 | 实际路径 | 说明 |
|----------|----------|------|
| /support/create | /support/tickets/create | 用户创建工单 |
| /support/[id] | /support/tickets/[id] | 用户查看/回复工单详情 |
| /support/list | /support/tickets | 用户工单列表 |
| /admin/support-tickets | /admin/support | 管理员工单管理 |
| POST /api/support-tickets | POST /api/support/tickets | 用户创建工单（带 logAudit） |
| POST /support-ticket-replies | POST /api/support/tickets/[id]/replies | 用户回复工单（带 logAudit） |
| PUT /support-tickets/[id] | PUT /api/support/tickets/[id] | 用户更新/重开工单（带 logAudit） |
| GET /api/admin/support-tickets | GET /api/admin/support/tickets | 管理员获取工单列表 |
| PUT assign/update-status/reply | POST /api/admin/support/tickets/[id]/assign、update-status、respond、close、escalate | 管理员操作（均带 logAudit） |

---

## 1. 用户创建工单

**入口**: `/support/tickets/create`  
**API**: `POST /api/support/tickets`

**流程**:
- ✅ 前端提交 form → `fetch('/api/support/tickets', { method: 'POST', body: JSON.stringify({ title, description, ticket_type, priority }) })`
- ✅ 后端校验 `auth.uid()`，未登录返回 401
- ✅ 校验 title/description 必填及长度（title ≤ 200，description ≤ 5000）
- ✅ 使用 `sanitizeContent` 清洗输入
- ✅ 使用 `getSupabaseAdmin()` 插入 `support_tickets` 表（user_id = auth user）
- ✅ `logAudit(action='create_ticket', userId, resourceId: ticketId, result)`
- ✅ 通知管理员由 DB 触发器 `trigger_create_ticket_creation_notification` 完成（content_key: ticket_created）

**审计**: create_ticket 成功/失败均记录，不记录 description 原文。

---

## 2. 用户查看/更新工单

**查看**  
- 入口: `/support/tickets/[id]`，服务端加载工单并校验所有权或 admin/support  
- RLS: `Users can view own tickets`（user_id = auth.uid() OR assigned_to = auth.uid() OR admin/support）

**更新**  
- API: `PUT /api/support/tickets/[id]`
- ✅ 校验 auth 与所有权（ticket.user_id === user.id）
- ✅ 允许更新 title、description；允许将 status 从 closed 改为 open（reopen）
- ✅ `logAudit(action='update_ticket', userId, resourceId, result, meta.fields)`

---

## 3. 用户回复工单

**API**: `POST /api/support/tickets/[id]/replies`

**流程**:
- ✅ 校验 auth；校验 ticket 存在且当前用户为 owner / assigned / admin/support
- ✅ 禁止对已关闭工单回复
- ✅ content 长度 ≤ 5000，`sanitizeContent` 后写入 `support_ticket_replies`
- ✅ 更新工单 `updated_at`
- ✅ `logAudit(action='reply_ticket', userId, resourceId: ticketId, result)`
- ✅ 通知由 DB 触发器 `trigger_create_ticket_reply_notification` 完成（用户回复通知管理员/被分配者）

**前端**: `TicketDetailClient` 使用 `fetch('/api/support/tickets/${ticketId}/replies', { method: 'POST', body: JSON.stringify({ content }) })`。

---

## 4. 管理员处理工单

**列表**: `GET /api/admin/support/tickets`  
- ✅ requireAdminOrSupport  
- ✅ 支持 status、priority、assignedTo 筛选，返回工单及统计

**分配**: `POST /api/admin/support/tickets/[id]/assign`  
- ✅ logAudit(action='ticket_assign')  
- ✅ 通知被分配管理员（API 内 insert + 触发器）

**状态更新**: `POST /api/admin/support/tickets/[id]/update-status`  
- ✅ body: `{ status: 'in_progress' | 'resolved' | 'closed' }`  
- ✅ logAudit(action='ticket_update_status', meta: { previousStatus, newStatus })  
- ✅ 状态变更通知由 DB 触发器 `trigger_create_ticket_status_change_notification` 完成

**回复**: `POST /api/admin/support/tickets/[id]/respond`  
- ✅ logAudit(action='ticket_respond')  
- ✅ 通知工单创建者由触发器完成

**关闭**: 使用 `update-status` 且 `status: 'closed'`（与 close 路由并存，管理员端统一走 update-status 以统一审计）

**升级**: `POST /api/admin/support/tickets/[id]/escalate`  
- ✅ logAudit(action='ticket_escalate')  
- ✅ 通知所有 admin

**前端**: `AdminSupportClient` 对所有状态变更（in_progress、resolved、closed）统一调用 `POST /api/admin/support/tickets/[id]/update-status`，保证审计一致。

---

## 5. DB / 事务与 RLS

**support_tickets**  
- id, user_id, title, description, status, priority, ticket_type, assigned_to, created_at, updated_at  
- RLS: 用户仅能查看自己的或被分配的；仅能创建自己的；仅能更新自己的（或 admin/support/assigned 更新任意）

**support_ticket_replies**  
- id, ticket_id, user_id, content, created_at  
- RLS: 仅能查看/插入与本人相关或 admin/support 可见的工单的回复

**notifications**  
- 由触发器及 API 内 insert 写入，含 content_key/content_params 以支持国际化

**logAudit**  
- 记录 action、userId（或无）、resourceId、resourceType、result、timestamp、meta（不含 description/回复原文）

---

## 6. 异常与侧效

- **RLS**: 非法访问被 RLS 拒绝，API 返回 403/404
- **toast/console**: 前端根据 API 错误展示 toast；后端开发环境 console.error
- **单条失败不阻塞**: 例如 Cron auto-close-tickets 单条关闭失败 continue，不影响其他工单
- **通知范围**: 创建→管理员；分配→被分配者；回复→对方；状态变更→工单创建者；升级→admin

---

## 7. 本轮新增/修改

| 项目 | 说明 |
|------|------|
| POST /api/support/tickets | 用户创建工单，服务端插入 + logAudit(create_ticket) |
| POST /api/support/tickets/[id]/replies | 用户回复，服务端插入 + 更新 updated_at + logAudit(reply_ticket) |
| PUT /api/support/tickets/[id] | 用户更新 title/description 或 reopen + logAudit(update_ticket) |
| POST /api/admin/support/tickets/[id]/update-status | 管理员更新状态 in_progress/resolved/closed + logAudit(ticket_update_status) |
| 创建页 | 改为调用 POST /api/support/tickets，不再直连 Supabase |
| 工单详情页回复 | 改为调用 POST /api/support/tickets/[id]/replies |
| 管理员端状态操作 | 统一走 update-status API（含关闭），不再直连 Supabase 改状态 |

---

## 8. 验证清单

- [x] 权限：普通用户仅能操作本人工单（API 校验 + RLS）
- [x] 权限：管理员可操作所有工单（requireAdminOrSupport）
- [x] DB：工单、回复、状态、assigned_to 正确更新
- [x] 通知：用户提交→管理员；管理员处理→用户；分配→被分配者
- [x] 日志：创建/更新/回复/分配/状态变更均 logAudit，不含敏感正文
- [x] 异常：RLS 拒绝非法操作；异常记录不阻塞其他操作

---

## 结论

支持工单与管理员操作全链路已按任务 16 要求验证并补齐：用户创建/查看/更新/回复均经 API，并写入 logAudit；管理员列表/分配/状态更新/回复/关闭/升级均经 API 且带 logAudit；通知与 RLS 符合预期；异常处理与审计完整。
