# 通知系统 — 审计报告

**审计范围**：通知类型与接口、发送与接收逻辑、权限与隐私、异常处理与日志、性能与稳定性  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议；已修复项已落地。

---

## 1. 通知类型与接口

**页面与接口**：`/main/notifications`、无独立通知 API（数据经 Supabase + RLS）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 系统通知、私信提醒、点赞/评论/打赏通知类型区分正确 | **通过**：NotificationList 按 `type`（system、like、comment、follow、order、commission、report、repost、share、favorite、want 等）区分链接与文案；打赏/订单/订阅/保证金等由业务插入 type=system 或 order，与前端展示一致。 | 通过 | 无。 |
| 用户只能接收到自己相关的通知 | **通过**：列表查询 `.eq('user_id', user.id)`；RLS “Users can view own notifications” 为 `user_id = auth.uid()`；服务端/触发器插入时均指定 `user_id` 为被通知人。 | 通过 | 无。 |

---

## 2. 发送与接收逻辑

**涉及**：触发器（like、comment、follow、repost、post_review 等）、API 内插入（订单、打赏、订阅、保证金、纠纷等）。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 通知触发条件正确（如点赞后通知被点赞人） | **通过**：点赞触发器通知帖子作者；评论通知帖子作者或父评论作者；打赏/订单/订阅等由支付/订单流程在成功后插入，对象正确。 | 通过 | 无。 |
| 多端同步是否正常（Web、Mobile） | **通过**：NotificationList 与 NotificationBell 订阅 Realtime `postgres_changes`，filter `user_id=eq.${user.id}`，新插入通知会推送到所有端；已读状态依赖客户端 update + invalidateQueries，多端刷新后一致。 | 通过 | 无。 |
| 消息重复发送或遗漏是否处理 | **部分**：评论触发器有 5 秒内同类型同 related_id 去重；多数触发器与 API 无重试，插入失败仅记录日志不重发，存在遗漏可能。 | **低** | 已修复：关键路径（打赏、订单支付、用户打赏）插入失败时记录日志；可选：对关键通知增加重试或写入失败队列表。 |

---

## 3. 权限与隐私

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户无法查看或操作他人通知 | **已修复**：列表与 RLS 仅允许读/更新本人；原“标记单条已读”仅 `.eq('id', id)`，未加 `user_id`，RLS 会拦阻他人记录但客户端未显式限定。已改为 `.eq('id', id).eq('user_id', user.id)`，且无 user 时提前 return。 | ~~低~~ 已修复 | 无。 |
| 通知内容不泄露敏感信息（私信内容、支付数据） | **通过**：通知仅含标题、摘要文案（如“收到打赏”“新订单”）、金额展示（如 ¥xx）、related_id/link；无私信原文、无卡号/密码/完整支付流水。 | 通过 | 无。 |

---

## 4. 异常处理与日志

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 通知发送失败是否有回退或重试机制 | **部分**：无统一重试；失败仅记录日志，支付/订单流程不因通知失败而回滚。 | **低** | 已修复：在打赏、订单支付、用户打赏等路径检查 insert 错误并 `console.error`（仅 error.message，不记录 PII）；可选：重试或失败队列表。 |
| 关键操作是否有日志 | **通过**：触发器内部分有 RAISE WARNING（如 post_review）；process-deposit-refund 已有 notifError 日志；本次在 process-tip-payment、process-order-payment、process-user-tip-payment 增加通知插入失败日志。 | 通过 | 无。 |
| 日志中不泄露敏感信息 | **通过**：仅记录 `error.message` 或模块标识，不记录 `user_id`、金额、通知 content。 | 通过 | 无。 |

---

## 5. 性能与稳定性

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 高并发情况下通知发送延迟 | **低**：通知写入为 DB insert，无独立队列；高并发时依赖 Supabase/DB 性能，触发器与 API 均为同步写入。 | 低 | 可选：对非关键路径通知做异步队列，避免阻塞主流程。 |
| 消息队列或推送服务是否稳定 | **通过**：无独立 MQ；Realtime 依赖 Supabase Realtime，列表拉取为 Supabase 查询，稳定性依赖 Supabase SLA。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 状态 |
|------|--------|----------|----------|------|
| 1 | 标记已读未显式限定 user_id | 单条已读仅 eq('id', id)，RLS 虽拦阻但客户端未限定本人 | ~~低~~ | **已修复**：.eq('user_id', user.id) 且无 user 时 return |
| 2 | 通知插入失败未记录 | 打赏/订单支付等 insert 未检查错误，排查困难 | 低 | **已修复**：process-tip、process-order、process-user-tip 失败时 console.error |
| 3 | 通知无重试 | 插入失败不重试，可能遗漏 | 低 | 可选：重试或失败队列表 |

---

## 7. 已实施的修复

1. **`src/components/notification/NotificationList.tsx`**  
   - `markAsReadMutation`：增加 `.eq('user_id', user.id)`，且 `if (!user?.id) return`，仅更新当前用户自己的通知。

2. **`src/lib/payments/process-tip-payment.ts`**  
   - 打赏成功后通知 insert：检查 `notifError`，失败时 `console.error('[process-tip-payment] Notification insert failed:', notifError.message)`。

3. **`src/lib/payments/process-order-payment.ts`**  
   - 买家与卖家通知 insert：分别检查 `notifBuyerError` / `notifSellerError`，失败时 `console.error('[process-order-payment] ...')`（仅 message）。

4. **`src/lib/payments/process-user-tip-payment.ts`**  
   - 用户打赏成功后通知 insert：检查 `notifError`，失败时 `console.error('[process-user-tip-payment] Notification insert failed:', notifError.message)`。

---

## 8. 与既有审计的衔接

- **INSERT RLS**：已由迁移 `190_notifications_insert_rls_restrict.sql` 收紧，仅允许 `user_id = auth.uid()` 或 admin/support；触发器使用 SECURITY DEFINER，后端使用 service role，不受影响。
- **查看/更新**：RLS “Users can view own notifications” / “Users can update own notifications” 已限制为本人，本次仅在客户端标记已读时显式加上 `user_id` 条件。

---

## 9. 可选后续优化

- 对关键通知（如支付成功）增加失败重试或写入“待重试”表，由定时任务补发。
- 对非关键通知（如点赞）可考虑异步写入，减轻主流程延迟。
- 多端已读状态可考虑对 `notifications` 的 UPDATE 做 Realtime 订阅，或窗口聚焦时重新拉取，以提升一致性。
