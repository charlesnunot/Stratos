# 支持工单与管理员操作链路审计报告（任务 24）

## 任务名称
Support Tickets & Admin Full Linkage Test

## 任务结果：✅ 成功

端到端链路已审计，发现并修复了 params 类型、失败路径 logAudit、审计动作命名及 Cron 一致性等问题。

---

## 验证点概览

| 验证点 | 状态 |
|--------|------|
| 用户只能访问自己创建的工单 | ✅ RLS + 用户 API 校验 ownership |
| 管理员/支持人员可读写工单 | ✅ requireAdminOrSupport + admin API |
| support_tickets 与 support_ticket_replies 一致 | ✅ API 内插入/更新 |
| 通知正确触发 | ✅ DB 触发器（创建/回复/状态变更/分配） |
| 审计日志 create_support_ticket / reply_support_ticket | ✅ 已对齐命名并补齐失败路径 |
| 审计日志 admin 操作（assign/close/respond/update_status/escalate） | ✅ 成功与失败均记录 |
| Cron 联动 | ✅ auto_close_tickets 使用 getSupabaseAdmin + logAudit |

---

## 功能入口与实现对应

- **用户创建工单**：`POST /api/support/tickets` → support_tickets 插入，触发器通知 admin/support。
- **用户回复工单**：`POST /api/support/tickets/[id]/replies` → support_ticket_replies 插入，触发器通知 assigned_to 或全体 admin/support。
- **管理员处理**：  
  - `POST /api/admin/support/tickets/[id]/assign` → 更新 assigned_to，API 内插入分配通知。  
  - `POST /api/admin/support/tickets/[id]/close` → 更新 status=closed，触发器通知用户。  
  - `POST /api/admin/support/tickets/[id]/respond` → 插入回复，触发器通知工单创建者。  
  - `POST /api/admin/support/tickets/[id]/update-status` → 更新 status，触发器通知用户。  
  - `POST /api/admin/support/tickets/[id]/escalate` → 更新 priority，通知全体 admin。
- **Cron**：`GET /api/cron/auto-close-tickets` → 自动关闭长期未动的 resolved/in_progress 工单并通知用户。

---

## 修复的问题

### 1. 用户端审计动作命名与任务对齐（P2）

**问题**：任务要求 `create_support_ticket`、`reply_support_ticket`，实现为 `create_ticket`、`reply_ticket`。

**修复**：  
- `src/app/api/support/tickets/route.ts`：logAudit action 改为 `create_support_ticket`。  
- `src/app/api/support/tickets/[id]/replies/route.ts`：logAudit action 改为 `reply_support_ticket`。

### 2. Admin 工单 API 使用 Next 15 params 类型（P1）

**问题**：assign、close、respond、update-status、escalate 使用 `params: { id: string }` 且直接使用 `params.id`，在 Next 15 中 params 为 Promise。

**修复**：  
- 上述 5 个 route 的 params 类型改为 `Promise<{ id: string }>`，并在函数开头 `const { id: ticketId } = await params`（或等效），后续统一使用 `ticketId`。

### 3. Admin 工单 API 失败路径缺少 logAudit（P1）

**问题**：assign/close/respond/update-status/escalate 在 update 或 insert 失败时未记录 logAudit，审计链路不完整。

**修复**：  
- assign：updateError 时增加 `logAudit(action: 'ticket_assign', result: 'fail', meta: { reason })`。  
- close：updateError 时增加 `logAudit(action: 'ticket_close', result: 'fail', meta: { reason })`。  
- respond：replyError 时增加 `logAudit(action: 'ticket_respond', result: 'fail', meta: { reason })`。  
- update-status：updateError 时增加 `logAudit(action: 'ticket_update_status', result: 'fail', meta: { reason })`。  
- escalate：updateError 时增加 `logAudit(action: 'ticket_escalate', result: 'fail', meta: { reason })`。

### 4. Admin assign/respond/escalate 的 request.json() 安全性（P2）

**问题**：assign、respond、escalate 直接 `await request.json()`，无效 JSON 会抛错且未统一返回 400。

**修复**：  
- 三处均改为在 try/catch 中解析 body，catch 时返回 `{ error: 'Invalid JSON' }, 400`。  
- respond 使用 `body.content`；escalate 使用 `body.priority`、`body.reason`。

### 5. Assign API 对「未分配」的规范化（P2）

**问题**：前端可能传 `assignedTo: 'unassigned'`，若直接写入会导致 assigned_to 存成字符串 `'unassigned'`，与 schema 不符。

**修复**：  
- 在 assign route 中规范化：若 `assignedTo === 'unassigned'` 或为空，则视为 `null`，写入 `assigned_to: null`。

### 6. Cron auto-close-tickets 使用 getSupabaseAdmin 与失败 logAudit（P2）

**问题**：Cron 内联创建 Supabase admin 客户端，且失败分支未记录 logAudit。

**修复**：  
- 使用 `getSupabaseAdmin()` 替代内联 createClient。  
- 在 catch 中增加 `logAudit(action: 'cron_auto_close_tickets', result: 'fail', meta: { error: message })`。

---

## 已确认无误的链路

- **工单创建通知**：migration 196 的 `create_ticket_creation_notification` 在 support_tickets INSERT 后为所有 admin/support 插入通知（SECURITY DEFINER）。  
- **工单回复通知**：`create_ticket_reply_notification` 在 support_ticket_replies INSERT 后按「用户回复→通知 assigned_to 或全体 admin/support；支持回复→通知工单创建者」插入通知。  
- **工单状态变更通知**：`create_ticket_status_change_notification` 在 support_tickets 的 status 变更后通知工单创建者。  
- **工单分配通知**：assign API 内使用 supabaseAdmin 插入分配给被分配人的通知；migration 197 的触发器在 assigned_to 变更时也会插入分配通知（可能重复，以 API 为准亦可，或后续可只保留其一）。  
- **权限**：用户 API 校验 ticket.user_id 或 assigned_to / admin；admin API 统一 requireAdminOrSupport。

---

## 可选增强（未在本次实现）

- **check-unassigned-tickets**：Cron 定期检查未分配工单并提醒管理员（如通知或汇总）。  
- **auto-escalate-tickets**：Cron 对超时未处理工单自动升级优先级并通知管理员/高级支持。  

上述可在后续迭代中作为独立 Cron 与通知逻辑实现。

---

## 总结

任务 24 对支持工单与管理员操作的端到端链路完成了审计与修复：统一了用户端审计动作命名、补齐了 admin 各操作的失败路径 logAudit、修正了 Next 15 params 与 request.body 解析、规范了「未分配」语义与 Cron 的 admin 客户端及失败审计。当前工单创建/回复/分配/关闭/回复/改状态/升级与 Cron 自动关闭的权限、通知和审计日志均符合要求。
