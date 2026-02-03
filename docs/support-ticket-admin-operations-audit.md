# 推演任务 10 — 支持工单与管理员操作链路审计报告

**任务名称**: Support Ticket & Admin Operations Linkage Test  
**执行日期**: 2026-01-31

---

## 一、审计范围

验证支持工单系统从用户创建 → 管理员处理 → 状态更新 → 通知与日志的完整端到端链路。

### 检查覆盖

1. **用户端**
   - 创建工单页面 `/support/tickets/create`
   - 查看工单列表 `/support/tickets`
   - 工单详情 `/support/tickets/[id]`

2. **管理员端**
   - 工单管理页面 `/admin/support`
   - 状态变更、指派操作

3. **数据库**
   - `support_tickets` 表及 RLS
   - `support_ticket_replies` 表及 RLS
   - 通知触发器

4. **通知系统**
   - 数据库触发器自动生成通知
   - `content_key` 国际化支持

---

## 二、发现问题及修复

### 问题 1: 创建工单页面硬编码中文

**文件**: `src/app/[locale]/(main)/support/tickets/create/page.tsx`

**问题描述**:
- Toast 标题使用硬编码 "错误"
- 表单选项（工单类型、优先级）使用硬编码中文

**修复**:
- 将 toast 标题改为 `tCommon('error')`
- 将表单选项改为使用 `t()` 翻译函数
- 支持 `{max}` 参数的动态翻译

**变更示例**:
```typescript
// Before
toast({ variant: 'destructive', title: '错误', ... })
<option value="general">一般问题</option>

// After
toast({ variant: 'destructive', title: tCommon('error'), ... })
<option value="general">{t('typeGeneral')}</option>
```

---

### 问题 2: 管理员工单管理页面硬编码中文

**文件**: `src/app/[locale]/(main)/admin/support/AdminSupportClient.tsx`

**问题描述**:
- 标签硬编码: "用户:", "分配给:", "类型:", "优先级:"
- 下拉选项: "未分配"
- 日期格式固定 `toLocaleString('zh-CN')`

**修复**:
- 使用 `t()` 翻译函数替换硬编码字符串
- 移除固定语言代码，使用浏览器默认区域设置

**变更示例**:
```typescript
// Before
<span>用户: {ticket.user?.display_name}</span>
<option value="unassigned">未分配</option>

// After
<span>{t('userLabel')}: {ticket.user?.display_name}</span>
<option value="unassigned">{t('unassigned')}</option>
```

---

### 问题 3: 工单详情页面硬编码中文

**文件**: `src/app/[locale]/(main)/support/tickets/[id]/TicketDetailClient.tsx`

**问题描述**:
- 标签硬编码: "类型:", "优先级:", "状态:", "创建时间:"
- 日期格式固定 `toLocaleString('zh-CN')`

**修复**:
- 使用 `t()` 和 `tCommon()` 翻译函数
- 移除固定语言代码

---

### 问题 4: 工单列表页面硬编码中文

**文件**: `src/app/[locale]/(main)/support/tickets/page.tsx`

**问题描述**:
- 标签硬编码: "类型:", "创建时间:", "更新时间:"
- 日期格式固定 `toLocaleString('zh-CN')`

**修复**:
- 使用翻译函数替换所有硬编码字符串
- 添加 `updatedAt` 翻译键到 common 命名空间

---

### 问题 5: 数据库通知触发器硬编码中文

**文件**: `supabase/migrations/147_add_ticket_notifications.sql`

**问题描述**:
工单相关通知触发器中硬编码中文内容:
- "新工单创建"
- "创建了一个新工单："
- "工单有新回复"
- "回复了工单："
- "您的工单有新回复"
- "工单状态已更新"
- "处理中", "已解决", "已关闭"

**修复**: 创建迁移文件 `196_ticket_notifications_i18n.sql`

更新所有触发器函数，添加:
- `content_key` 字段用于前端国际化
- `content_params` 字段包含动态参数
- 英文默认 `title` 和 `content`

**content_key 映射**:
| content_key | 用途 |
|-------------|------|
| `ticket_created` | 新工单创建通知给管理员 |
| `ticket_reply` | 用户回复工单通知管理员 |
| `ticket_reply_from_support` | 支持人员回复通知用户 |
| `ticket_status_change` | 工单状态变更通知用户 |

**content_params 示例**:
```json
{
  "userName": "用户名",
  "ticketTitle": "工单标题",
  "newStatus": "resolved"
}
```

---

## 三、新增翻译键

### support 命名空间 (zh.json / en.json)

| 键名 | 中文 | 英文 |
|------|------|------|
| `typeGeneral` | 一般问题 | General |
| `typeTechnical` | 技术问题 | Technical |
| `typeBilling` | 账单问题 | Billing |
| `typeRefund` | 退款问题 | Refund |
| `typeOther` | 其他 | Other |
| `priorityLow` | 低 | Low |
| `priorityMedium` | 中 | Medium |
| `priorityHigh` | 高 | High |
| `priorityUrgent` | 紧急 | Urgent |
| `userLabel` | 用户 | User |
| `assignedTo` | 分配给 | Assigned to |
| `unassigned` | 未分配 | Unassigned |
| `type_*` | 类型映射 | Type mapping |
| `priority_*` | 优先级映射 | Priority mapping |

### common 命名空间

| 键名 | 中文 | 英文 |
|------|------|------|
| `updatedAt` | 更新时间 | Updated At |

---

## 四、验证结果

### 验证点 1: 用户只能创建/查看本人工单 ✅

**RLS 策略** (`001_initial_schema.sql`):
- SELECT: `user_id = auth.uid()` 或 `assigned_to = auth.uid()` 或 admin/support
- INSERT: `user_id = auth.uid()`

### 验证点 2: 管理员权限校验正确 ✅

**RLS 策略** (`146_add_ticket_type_and_update_rls.sql`):
- UPDATE: admin/support 可更新所有工单
- 前端: 仅 admin/support 角色可访问管理页面

### 验证点 3: 工单状态流转正确 ✅

**状态流**: open → in_progress → resolved → closed
- 状态变更通过前端直接更新数据库
- 触发器自动发送状态变更通知

### 验证点 4: 回复记录完整 ✅

**RLS 策略** (`009_create_missing_tables.sql`):
- SELECT: 工单创建者或被分配人员可查看
- INSERT: 工单创建者或被分配人员可回复
- 回复按创建时间升序排列

### 验证点 5: 通知触发到正确目标用户 ✅

**通知触发器**:
1. 工单创建 → 通知所有 admin/support
2. 用户回复 → 通知被分配支持人员或所有 admin/support
3. 支持人员回复 → 通知工单创建者
4. 状态变更 → 通知工单创建者

### 验证点 6: Cron 定时任务 ⚠️

**现状**: 未发现 SLA 超时提醒或工单自动升级的 Cron 任务

**建议**: 如需实现，可创建以下 Cron 任务:
- `check-sla-tickets`: 检查超时未处理工单
- `escalate-urgent-tickets`: 自动升级紧急工单优先级

### 验证点 7: logAudit 审计日志 ⚠️

**现状**: 支持工单系统未调用 `logAudit`

**原因分析**: 
- 前端直接使用 Supabase 客户端操作数据库
- 无独立 API 路由可插入审计日志

**建议**: 如需审计日志，可:
1. 创建 API 路由封装工单操作
2. 使用数据库触发器记录操作日志

---

## 五、架构特点

### 优点

1. **数据库触发器通知**: 通知通过触发器自动创建，无需前端调用
2. **RLS 策略完善**: 用户只能访问自己的工单，admin/support 可访问所有
3. **国际化支持**: 添加 `content_key` 和 `content_params` 支持多语言
4. **状态机清晰**: open → in_progress → resolved → closed

### 设计说明

- 工单操作直接通过 Supabase 客户端，无独立 API 路由
- 通知系统依赖数据库触发器，降低前端复杂度
- 前端使用 React Query 管理状态和缓存

---

## 六、修改文件清单

| 文件路径 | 修改类型 |
|----------|----------|
| `src/app/[locale]/(main)/support/tickets/create/page.tsx` | 国际化修复 |
| `src/app/[locale]/(main)/admin/support/AdminSupportClient.tsx` | 国际化修复 |
| `src/app/[locale]/(main)/support/tickets/[id]/TicketDetailClient.tsx` | 国际化修复 |
| `src/app/[locale]/(main)/support/tickets/page.tsx` | 国际化修复 |
| `src/messages/zh.json` | 新增翻译键 |
| `src/messages/en.json` | 新增翻译键 |
| `supabase/migrations/196_ticket_notifications_i18n.sql` | 新增迁移 |

---

## 七、结论

支持工单与管理员操作链路核心功能完整，RLS 策略正确实现访问控制。主要问题集中在国际化硬编码，已全部修复。数据库通知触发器已添加 `content_key` 支持，确保前端可正确显示多语言通知内容。

**状态**: ✅ 审计完成，所有发现问题已修复
