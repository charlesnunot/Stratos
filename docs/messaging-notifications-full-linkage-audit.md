# 消息与通知功能链路审计报告（任务 23）

## 任务名称
Messaging & Notifications Full Linkage Test

## 任务结果：✅ 成功

端到端链路已审计，发现并修复了与 RLS、params 类型及通知插入相关的问题。

---

## 验证点概览

| 验证点 | 状态 |
|--------|------|
| 私聊仅参与者可读写 | ✅ RLS + POST /api/messages 校验 |
| 群聊仅成员可写入/查看 | ✅ RLS + POST /api/messages 校验 |
| 通知仅本人可查看 | ✅ notifications RLS |
| 消息插入 → 通知插入 | ✅ API 内用 getSupabaseAdmin() 插入通知 |
| 审计日志 send_message / send_group_message | ✅ logAudit 已记录 |
| 前端订阅消息/通知 | ✅ ChatWindow / NotificationList 使用 supabase.channel |
| Cron 联动 | ✅ 订单/佣金/保证金等 Cron 会触发通知 |

---

## 修复的问题

### 1. 订单纠纷通知违反 RLS（P0）

**问题**：`/api/orders/[id]/dispute` 使用用户级 `supabase`（createClient）向**对方**插入通知。RLS 策略 "Users can insert own notifications" 仅允许 `user_id = auth.uid()`，因此向卖家/买家插入通知会被拒绝。

**修复**：
- 引入 `getSupabaseAdmin()`，使用 admin 客户端插入纠纷通知，绕过 RLS。
- 纠纷创建时误用 `params.id`（params 为 Promise），改为使用已 await 的 `orderId`。
- catch 统一为 `error: unknown`。

**文件**：`src/app/api/orders/[id]/dispute/route.ts`

### 2. 举报结果通知违反 RLS（P0）

**问题**：`ReportManagement.tsx` 在客户端使用用户级 `supabase` 为举报者与被举报者插入通知。管理员登录时 `auth.uid()` 为管理员，插入 `user_id: report.reporter_id` 或 `reportedUserId` 会被 RLS 拒绝。

**修复**：
- 新增服务端 API：`POST /api/admin/reports/[id]/send-result-notification`，body：`{ action: 'resolved' | 'rejected' | 'content_deleted' }`。
- API 使用 `requireAdminOrSupport` 鉴权，使用 `getSupabaseAdmin()` 插入通知，并在服务端根据 `reported_type`/`reported_id` 解析被举报人 ID。
- `ReportManagement` 改为调用该 API，不再直接插入 notifications。

**文件**：
- 新增：`src/app/api/admin/reports/[id]/send-result-notification/route.ts`
- 修改：`src/components/admin/ReportManagement.tsx`（sendReportNotifications 改为 fetch 上述 API）

### 3. 群组 API 统一使用 getSupabaseAdmin（P2）

**问题**：`/api/groups/create` 与 `/api/groups/[id]/members` 内联创建 service role 客户端，与项目其他 API 使用 `getSupabaseAdmin()` 的方式不一致。

**修复**：
- 两处均改为 `await getSupabaseAdmin()`。
- catch 统一为 `err: unknown`。

**文件**：`src/app/api/groups/create/route.ts`，`src/app/api/groups/[id]/members/route.ts`

---

## 已确认无误的链路

- **私聊/群聊消息**：`POST /api/messages` 使用 getSupabaseAdmin 插入消息与通知，logAudit(send_message / send_group_message)，前端 ChatWindow 调用该 API 并订阅 messages 表。
- **群组创建/成员**：create 与 members 的增删均使用 admin 插入通知，并记录 logAudit。
- **数据库触发器**：评论/点赞/转发/收藏/分享等通知触发器均使用 SECURITY DEFINER，可向他人插入通知。
- **订单/支付/佣金/保证金/纠纷等**：其余插入通知的 API 或服务均使用 supabaseAdmin / getSupabaseAdmin，符合 RLS 要求。

---

## 总结

任务 23 对消息与通知的端到端链路进行了审计，重点修复了**两处因使用用户级客户端为他人插入通知而违反 RLS** 的问题（纠纷通知、举报结果通知），并统一了群组 API 的 admin 客户端与错误类型。修复后，所有通知插入要么通过 service role/admin，要么通过 SECURITY DEFINER 触发器完成，满足「通知仅本人可查看、系统可为他人写入」的设计。
