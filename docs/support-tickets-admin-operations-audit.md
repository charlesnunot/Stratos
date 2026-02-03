# 推演任务 13 — 支持工单与管理员操作链路审计报告

## 审计概述

**任务**: 支持工单与管理员操作全链路测试 (Support Tickets & Admin Operations Full Linkage Test)  
**日期**: 2026-01-31  
**状态**: ✅ 全部问题已修复

---

## 验证链路

### 1. 用户创建工单流程

**入口**: `/support/tickets/create`

**流程验证**:
- ✅ 前端页面收集 title、description、ticket_type、priority
- ✅ 使用 `sanitizeContent` 对输入进行清洗
- ✅ 长度限制验证（title: 200, description: 5000）
- ✅ 直接通过 Supabase 客户端插入 `support_tickets` 表
- ✅ RLS 策略验证用户身份 (`auth.uid() = user_id`)
- ✅ 数据库触发器自动创建通知给所有 admin/support 用户
- ✅ 通知使用 `content_key` 支持国际化

**数据库触发器**: `trigger_create_ticket_creation_notification`
- 通知 content_key: `ticket_created`
- 通知参数: `userName`, `ticketTitle`

---

### 2. 用户查看工单详情

**入口**: `/support/tickets/[id]`

**权限验证**:
- ✅ 服务端验证用户身份
- ✅ 验证用户是工单所有者或 admin/support
- ✅ 非授权用户重定向到工单列表

**RLS 策略**: `Users can view own tickets`
```sql
user_id = auth.uid() OR 
assigned_to = auth.uid() OR
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
```

---

### 3. 管理员操作工单

#### 3.1 查看工单列表

**API**: `GET /api/admin/support/tickets`

- ✅ 权限检查：requireAdminOrSupport
- ✅ 支持筛选：status, priority, assignedTo
- ✅ 返回统计数据（各状态计数）

#### 3.2 分配工单

**API**: `POST /api/admin/support/tickets/[id]/assign`

- ✅ 权限检查：requireAdminOrSupport
- ✅ 验证被分配者是 admin/support
- ✅ 自动更新状态为 `in_progress`（如果当前是 open）
- ✅ 通知被分配的管理员（content_key: `ticket_assigned`）
- ✅ 写入审计日志 `logAudit(action: 'ticket_assign')`

**数据库触发器**: `trigger_create_ticket_assignment_notification`（新增）

#### 3.3 回复工单

**API**: `POST /api/admin/support/tickets/[id]/respond`

- ✅ 权限检查：requireAdminOrSupport
- ✅ 内容清洗 `sanitizeContent`
- ✅ 长度限制（5000 字符）
- ✅ 禁止回复已关闭工单
- ✅ 数据库触发器自动通知工单创建者
- ✅ 写入审计日志 `logAudit(action: 'ticket_respond')`（不记录内容）

#### 3.4 关闭工单

**API**: `POST /api/admin/support/tickets/[id]/close`

- ✅ 权限检查：requireAdminOrSupport
- ✅ 验证工单未关闭
- ✅ 数据库触发器自动通知用户
- ✅ 写入审计日志 `logAudit(action: 'ticket_close')`

#### 3.5 升级工单

**API**: `POST /api/admin/support/tickets/[id]/escalate`

- ✅ 权限检查：requireAdminOrSupport
- ✅ 自动升级优先级（low → medium → high → urgent）
- ✅ 通知所有 admin（content_key: `ticket_escalated`）
- ✅ 如果是 support 升级，添加系统回复记录
- ✅ 写入审计日志 `logAudit(action: 'ticket_escalate')`

---

### 4. 自动化 Cron 任务

**Cron**: `/api/cron/auto-close-tickets` (新增)  
**调度**: `0 7 * * *` (每日 7:00)

**自动关闭规则**:
- 状态为 `resolved` 且 7 天无活动 → 关闭
- 状态为 `in_progress` 且 30 天无活动 → 关闭

**处理流程**:
- ✅ verifyCronSecret 验证
- ✅ 更新工单状态为 `closed`
- ✅ 通知用户（content_key: `ticket_auto_closed`）
- ✅ 写入 `cron_logs` 表
- ✅ 写入审计日志 `logAudit(action: 'cron_auto_close_tickets')`

---

### 5. 数据库表结构

#### support_tickets
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 创建者 |
| title | TEXT | 标题 |
| description | TEXT | 描述 |
| status | TEXT | open/in_progress/resolved/closed |
| priority | TEXT | low/medium/high/urgent |
| ticket_type | TEXT | general/technical/billing/refund/other |
| assigned_to | UUID | 分配给的管理员 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

#### support_ticket_replies
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| ticket_id | UUID | 关联工单 |
| user_id | UUID | 回复者 |
| content | TEXT | 回复内容 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

### 6. RLS 策略完整性

#### support_tickets
| 策略 | 操作 | 条件 |
|------|------|------|
| Users can view own tickets | SELECT | 所有者/被分配者/admin/support |
| Users can create tickets | INSERT | auth.uid() = user_id |
| Users can update own tickets | UPDATE | 所有者 |
| Admin and support can update all tickets | UPDATE | admin/support 角色 |
| Assigned support can update assigned tickets | UPDATE | 被分配者 |

#### support_ticket_replies
| 策略 | 操作 | 条件 |
|------|------|------|
| Users can view ticket replies | SELECT | 工单所有者/被分配者/admin/support |
| Users can create ticket replies | INSERT | 工单所有者/被分配者/admin/support |

---

### 7. 通知完整性

| 场景 | 通知对象 | content_key |
|------|----------|-------------|
| 工单创建 | 所有 admin/support | ticket_created |
| 分配工单 | 被分配的管理员 | ticket_assigned |
| 用户回复 | 被分配者或所有 admin/support | ticket_reply |
| 管理员回复 | 工单创建者 | ticket_reply_from_support |
| 状态变更 | 工单创建者 | ticket_status_change |
| 工单升级 | 所有 admin | ticket_escalated |
| 自动关闭 | 工单创建者 | ticket_auto_closed |

---

### 8. 审计日志完整性

| 操作 | action | 记录内容 |
|------|--------|----------|
| 分配工单 | ticket_assign | ticketId, assignedTo, statusChange |
| 回复工单 | ticket_respond | ticketId, statusChange（不记录内容）|
| 关闭工单 | ticket_close | ticketId, previousStatus |
| 升级工单 | ticket_escalate | ticketId, previousPriority, newPriority |
| Cron 自动关闭 | cron_auto_close_tickets | closed_count |

**敏感信息保护**:
- ✅ 不记录工单 description
- ✅ 不记录回复 content
- ✅ 不记录用户个人信息

---

## 发现的问题与修复

### 问题 1: 缺少管理员操作 API 路由

**问题描述**: 管理员操作（分配、关闭、升级）通过前端直接操作 Supabase，无法记录审计日志。

**修复方案**: 
创建专用 API 路由：
- `POST /api/admin/support/tickets/[id]/assign`
- `POST /api/admin/support/tickets/[id]/respond`
- `POST /api/admin/support/tickets/[id]/close`
- `POST /api/admin/support/tickets/[id]/escalate`
- `GET /api/admin/support/tickets`

所有路由包含：
- 权限验证 (requireAdminOrSupport)
- 审计日志 (logAudit)
- 适当的通知

### 问题 2: 缺少自动关闭工单的 Cron 任务

**问题描述**: 系统没有自动关闭长期未响应工单的机制。

**修复方案**: 
创建 `/api/cron/auto-close-tickets` Cron 任务：
- 已解决工单 7 天无活动 → 自动关闭
- 处理中工单 30 天无活动 → 自动关闭
- 发送通知并记录审计日志

### 问题 3: 缺少工单分配通知触发器

**问题描述**: 当工单被分配给管理员时，被分配者没有收到通知。

**修复方案**: 
创建数据库触发器 `197_ticket_assignment_notification.sql`：
- 当 `assigned_to` 字段变更时触发
- 使用 content_key 支持国际化
- 不通知自我分配

### 问题 4: 前端未使用 API 路由

**问题描述**: AdminSupportClient 直接操作 Supabase 客户端，绕过 API 路由。

**修复方案**: 
更新 AdminSupportClient 使用 fetch 调用 API 路由：
- 分配工单使用 `/api/admin/support/tickets/[id]/assign`
- 关闭工单使用 `/api/admin/support/tickets/[id]/close`
- 升级工单使用 `/api/admin/support/tickets/[id]/escalate`
- 添加升级工单功能按钮
- 添加紧急工单统计卡片

### 问题 5: 缺少 i18n 翻译键

**问题描述**: 新增功能使用的翻译键在 messages 文件中缺失。

**修复方案**: 
添加翻译键（en.json 和 zh.json）：
- `ticketAssigned`, `ticketClosed`, `ticketEscalated`
- `escalate`, `urgentTickets`
- 通知 content_keys: `ticket_assigned`, `ticket_escalated`, `ticket_auto_closed`, `ticket_status_change`, `ticket_created`, `ticket_reply_from_support`

### 问题 6: 缺少工单升级功能

**问题描述**: 原前端没有升级工单的功能入口。

**修复方案**: 
- 添加升级按钮（非紧急、非关闭工单可见）
- 升级时自动提升优先级
- 通知所有管理员
- 添加系统回复记录

---

## 新增文件

| 文件 | 说明 |
|------|------|
| `src/app/api/admin/support/tickets/route.ts` | 工单列表 API |
| `src/app/api/admin/support/tickets/[id]/assign/route.ts` | 分配工单 API |
| `src/app/api/admin/support/tickets/[id]/respond/route.ts` | 回复工单 API |
| `src/app/api/admin/support/tickets/[id]/close/route.ts` | 关闭工单 API |
| `src/app/api/admin/support/tickets/[id]/escalate/route.ts` | 升级工单 API |
| `src/app/api/cron/auto-close-tickets/route.ts` | 自动关闭 Cron |
| `supabase/migrations/197_ticket_assignment_notification.sql` | 分配通知触发器 |

---

## 修改文件

| 文件 | 修改内容 |
|------|----------|
| `vercel.json` | 添加 auto-close-tickets Cron 调度 |
| `src/app/[locale]/(main)/admin/support/AdminSupportClient.tsx` | 使用 API 路由、添加升级功能 |
| `src/messages/en.json` | 添加新翻译键 |
| `src/messages/zh.json` | 添加新翻译键 |

---

## 验证清单

- [x] 用户权限校验：只能查看自己的工单
- [x] 管理员权限校验：assign/respond/close/escalate 权限
- [x] 通知完整性：用户/管理员均收到对应通知
- [x] 审计日志完整性：logAudit 包含 action、actorId、ticketId、result
- [x] 敏感信息保护：不记录 description 原文或敏感信息
- [x] 自动化 Cron：长期未处理工单自动关闭
- [x] Cron 日志：写入 cron_logs 和审计日志
- [x] 异常处理：API 异常返回 4xx/5xx
- [x] 国际化：所有通知使用 content_key

---

## 结论

支持工单与管理员操作链路全部验证通过。所有发现的问题已完全修复，包括：

1. **API 安全性**: 所有管理员操作通过专用 API 路由，确保权限验证和审计日志
2. **通知完整性**: 所有关键操作都会触发相应通知，支持国际化
3. **审计追踪**: 所有管理员操作都有审计日志，不记录敏感内容
4. **自动化**: 添加自动关闭工单的 Cron 任务，确保工单不会无限期挂起
5. **用户体验**: 前端添加升级功能和紧急工单统计
