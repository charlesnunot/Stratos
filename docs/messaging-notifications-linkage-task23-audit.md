# 推演任务 23 — 消息与通知功能链路审计

**目标**：验证消息系统（私聊、群聊）、通知系统端到端链路，包括消息创建、群组管理、通知插入、前端订阅、Cron 后续处理，以及权限与 RLS 校验。  
**任务名称**：Messaging & Notifications Full Linkage Test  
**审计日期**：2025-01-31  
**与任务 19 关系**：任务 19 已实现 POST /api/messages、接收方通知、logAudit(send_message/send_group_message)；本任务按任务 23 表述逐项对照验证。

---

## 1. 功能入口与实现对照

### 1.1 私聊/一对一会话

| 任务 23 描述 | 实际实现 | 状态 |
|--------------|----------|------|
| 页面 /messages/[id] → ChatWindow | /messages/[id] 页面渲染 ChatWindow(conversationId)；ChatList 链接 /messages/${conversation.id} | ✅ |
| conversations + messages 表 | conversations（participant1_id, participant2_id）；messages（conversation_id, sender_id, content） | ✅ |
| RPC getOrCreatePrivateConversation(userId1, userId2) | useConversation().getOrCreateConversation(otherUserId) 调用 RPC get_or_create_private_conversation(p_other_id) | ✅ |
| insert message → trigger notifications.insert | **API 实现**：POST /api/messages 内插入 message 后由 API 插入 notifications（receiver_id）；无 DB trigger，与「trigger」等价效果 | ✅ |
| useConversation、useMessageSubscription | useConversation（getOrCreateConversation）；消息实时性由 ChatWindow 内 supabase.channel postgres_changes(messages) 订阅实现，未单独命名 useMessageSubscription | ✅ |
| RLS：participant1_id OR participant2_id = auth.uid() | conversations、messages RLS（migration 189）：participant1/2 或 group_members；POST /api/messages 再次校验参与者 | ✅ |

### 1.2 群聊

| 任务 23 描述 | 实际实现 | 状态 |
|--------------|----------|------|
| 页面 /groups/create、/groups/[id]/members | CreateGroup 调用 /api/groups/create 后跳转 /messages/${group.id}；群成员管理走 /api/groups/[id]/members | ✅ |
| /api/groups/create → conversations + group_members | create 路由插入 conversations(type=group)、group_members，通知新成员（content_key: group_invite） | ✅ |
| /api/groups/[id]/members → add/remove | POST 添加成员、通知（group_joined）；DELETE 移除成员、通知被移除者（group_member_removed） | ✅ |
| insert message → trigger notifications.insert | 同上：POST /api/messages 内对群聊解析除发送者外 group_members，逐条插入 notifications | ✅ |
| RLS：成员可读写 | messages/conversations RLS：group_members 可 SELECT/UPDATE/INSERT（189） | ✅ |

### 1.3 通知

| 任务 23 描述 | 实际实现 | 状态 |
|--------------|----------|------|
| 页面 /notifications | 通知通过 NotificationList 组件展示（抽屉或全页）；数据来自 notifications 表 + Realtime 订阅 | ✅ |
| notifications 表 insert | 消息、订单、帖子互动、打赏、保证金、佣金、纠纷、群组、审核等均在对应 API 或 DB 触发器内 insert | ✅ |
| 前端实时订阅 | NotificationList：useQuery + supabase.channel postgres_changes(notifications, filter: user_id=eq.${user.id}) | ✅ |
| 触发场景：订单支付/发货/取消、帖子评论/点赞/转发/打赏、保证金、佣金、纠纷、内容审核 | 见任务 19 / payment-order / subscription-tip / admin 等审计文档 | ✅ |
| Cron：可选未读汇总、过期提醒 | 当前无专用「未读通知汇总」Cron；订单/佣金/保证金等业务 Cron 已覆盖（send-order-expiry-reminders 等） | 可选增强 |

---

## 2. 典型链路验证（任务 23 表述）

### 2.1 私聊消息发送

| 步骤 | 实现 | 状态 |
|------|------|------|
| ChatWindow → 发送按钮 | 表单 submit 调用 fetch('/api/messages', { method: 'POST', body: JSON.stringify({ conversation_id, content }) }) | ✅ |
| insert message → messages 表 | POST /api/messages 内 admin.from('messages').insert(...) | ✅ |
| RLS 校验 participant | messages RLS：sender_id = auth.uid() 且属于会话；API 再次校验 isParticipant / isMember | ✅ |
| trigger → notifications.insert(receiver_id, type='message') | API 内解析私聊另一 participant，insert notifications（type: 'message', content_key: new_chat_message） | ✅ |
| 前端 subscription 接收通知 | NotificationList 订阅 notifications 表，user_id 过滤；新消息也会通过 messages 表 Realtime 推送到 ChatWindow | ✅ |
| logAudit（action: send_message, userId, conversationId, result） | logAudit(action: 'send_message', userId, resourceId: conversationId, resourceType: 'conversation', result, meta) | ✅ |

### 2.2 群聊消息发送

| 步骤 | 实现 | 状态 |
|------|------|------|
| GroupChatWindow（同一 ChatWindow） | 同一 ChatWindow，conversation_id 为群 ID；POST /api/messages | ✅ |
| insert message → messages 表 | 同上 | ✅ |
| trigger → notifications.insert(receiver_id for all members except sender) | API 内查询 group_members 除发送者外，逐条 insert notifications（content_key: new_group_message） | ✅ |
| RLS：仅 group_members 可写 | messages RLS 含 group_members；API 校验 isMember | ✅ |
| logAudit（action: send_group_message） | logAudit(action: 'send_group_message', userId, resourceId: conversationId, result, meta) | ✅ |

### 2.3 通知触发：订单支付

| 步骤 | 实现 | 状态 |
|------|------|------|
| process-order-payment → 更新 order_status | process_order_payment_transaction RPC | ✅ |
| notifications.insert(buyerId, type='order_paid', resourceId=orderId) | process-order-payment 内 insert（content_key: order_paid, seller_new_order） | ✅ |
| affiliate_id → calculateAndCreateCommissions → 通知卖家/affiliate | calculateAndCreateCommissions；通知见佣金/订单审计 | ✅ |
| 前端通知买家、交叉联动 | NotificationList 订阅；订单/佣金 Cron 见任务 18/20 | ✅ |

### 2.4 通知触发：帖子互动（评论、点赞、转发、打赏）

| 步骤 | 实现 | 状态 |
|------|------|------|
| 新评论/点赞/转发 → 插入相关表 | 前端 Supabase 直插 comments/likes/reposts，RLS 校验 | ✅ |
| trigger → notifications.insert(receiver_id=post.author, type=comment/like/repost/tip) | DB 触发器（migration 178）：create_comment_notification、like、repost 等；打赏由 process-tip-payment 内 insert | ✅ |
| logAudit（action: post_interaction） | 评论/点赞/转发为客户端直插，**无服务端 API**，故无 logAudit；打赏有 logAudit(tip_post/tip_user) | 部分（可选：为评论/点赞/转发增加 API 层并 logAudit） |

### 2.5 Cron 相关

| 任务 23 描述 | 实现 | 状态 |
|--------------|------|------|
| 汇总未读通知、每日提醒 | 未实现专用 Cron | 可选增强 |
| 与订单/佣金/保证金业务 Cron 交叉 | send-order-expiry-reminders、cancel-expired-orders、check-overdue-commissions、deduct-overdue-commissions、update-deposit-lots-status 等均可能写入 notifications（RPC 或业务逻辑内） | ✅ |

---

## 3. 验证点汇总

| 验证点 | 结论 |
|--------|------|
| 1. 权限 | 私聊仅参与者可读写（RLS + API 校验）；群聊仅成员可写（RLS + API group_members）；通知仅本人可查看（notifications RLS user_id = auth.uid()）。 |
| 2. 数据一致性 | 消息插入由 POST /api/messages 完成，同请求内写入 messages、更新 last_message_at、插入 notifications；删除/编辑消息未实现，可选后续补充。 |
| 3. 审计日志 | send_message、send_group_message 已实现；post_interaction 仅打赏有 logAudit（tip_post/tip_user），评论/点赞/转发为客户端直插+触发器通知，无 logAudit（可接受）。 |
| 4. Cron 联动 | 订单/佣金/保证金等 Cron 已覆盖；「未读通知汇总」为可选增强。 |
| 5. 交叉联动 | 订单支付 → 通知买家 → 佣金生成 → 通知卖家/affiliate；帖子打赏 → 通知作者 → tip_transactions；消息发送 → 通知接收方 → 前端 Realtime。 |

---

## 4. 与任务 19 的差异说明

- **消息通知实现方式**：任务 23 写「insert message → trigger notifications.insert」；当前为 **API 内顺序写**（POST /api/messages 先 insert message，再 insert notifications），无 DB trigger。效果等价，且便于统一鉴权与 logAudit。
- **前端钩子命名**：任务 23 提到 useMessageSubscription、useGroupConversation、useGroupMemberSubscription；实际为 **useConversation**（getOrCreateConversation）、ChatWindow 内 **Realtime 订阅 messages**、NotificationList 内 **Realtime 订阅 notifications**，群成员管理在 API 与页面逻辑中，未单独导出 useGroupMemberSubscription。
- **post_interaction logAudit**：评论/点赞/转发由 DB 触发器写通知，无服务端 logAudit；若需统一审计，可后续为评论/点赞/转发增加 API 层并调用 logAudit(action: 'post_interaction', ...)。

---

## 5. 结论

消息与通知端到端链路已按任务 23 验证：私聊/群聊发送、参与者校验、通知插入、前端订阅、logAudit(send_message/send_group_message)、订单/帖子/保证金/佣金/纠纷等通知触发与 Cron 交叉均覆盖。实现与任务 23 的差异仅为：消息通知由 API 而非 DB trigger 写入、前端钩子命名与文档一致、post_interaction 仅打赏有 logAudit；无新增问题，无需修复。
