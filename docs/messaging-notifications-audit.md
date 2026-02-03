# 即时通讯与通知 — 审计报告

**审计范围**：私信、聊天、群组、通知及 `/api/track`  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 私信和聊天

### 1.1 页面与接口：`/main/messages`、`/main/messages/[id]`

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 用户只能看到自己参与的会话 | **私聊通过**：ChatList 按 `participant1_id.eq.${user.id}` 或 `participant2_id.eq.${user.id}` 拉取私聊；群聊通过 `group_members` 且 `user_id = user.id` 拉取。RLS 上 `conversations` 仅 participant1/participant2 或 admin/support 可 SELECT；`messages` 仅会话参与者或 admin/support 可 SELECT/INSERT。私聊列表与消息读写与权限一致。 | 通过 | 无。 |
| 会话详情页越权 | **私聊通过**：`/messages/[id]` 服务端用 `participant1_id === currentUser.id \|\| participant2_id === currentUser.id` 校验，非参与者重定向到 `/messages`。RLS 保证非参与者拿不到 conversation/messages。 | 通过 | 无。 |
| 群组会话与消息可见性 | **存在问题**：群组会话在创建时 `participant1_id = participant2_id = owner_id`（API 兼容写法）。RLS 对 `conversations` 和 `messages` 仅校验 `participant1_id`/`participant2_id`，**未**考虑 `group_members`。因此**仅群主**能通过 RLS 看到群会话和群消息；**非群主的群成员**无法通过 RLS 读取该会话或消息，打开 `/messages/[groupId]` 会得到 404（conversation 查不到），群聊对非群主成员不可用。 | **高** | 在 RLS 中为**群组会话**增加基于 `group_members` 的规则：① `conversations` 的 SELECT/UPDATE 允许 `conversation_type = 'group'` 且存在 `group_members(group_id=id, user_id=auth.uid())`；② `messages` 的 SELECT/INSERT/UPDATE 在 `conversation_type = 'group'` 时允许存在 `group_members(group_id=conversation_id, user_id=auth.uid())`。同时 `/messages/[id]` 服务端需识别群组会话并校验当前用户为 `group_members` 成员，再渲染 ChatPageClient。 |
| 消息发送、编辑、删除权限 | **发送**：RLS “Users can send messages in own conversations” 仅允许会话参与者（participant1/participant2）INSERT；群组下仅群主满足，需同上扩展 group_members。**编辑/删除**：当前无消息编辑、删除的 UI 或 API，messages 仅有 UPDATE 策略用于已读状态，未暴露任意编辑/删除，无额外风险。 | 中（依赖群组 RLS 修复） | 完成群组 RLS 后，发送权限自然覆盖群成员；若后续增加编辑/删除，需在 RLS 中限制为发送者本人或会话/群权限一致。 |
| 未登录访问消息页 | **部分**：`/messages` 未做服务端或前端“未登录即重定向”。ChatList 使用 `enabled: !!user`，未登录时列表为空，但页面仍可打开。 | **低** | 在消息页或布局中增加未登录重定向到登录页并带 `redirect=/messages`。 |

### 1.2 接口：`/api/messages/*`

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 是否存在专用消息 API | **无**：消息的拉取、发送、已读均通过前端直连 Supabase（RLS 校验），无 `/api/messages/*` 路由。权限完全依赖 RLS，与页面逻辑一致。 | 通过 | 无。 |

---

## 2. 群组管理：`/api/groups/*`

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 添加成员权限 | **通过**：`POST /api/groups/[id]/members` 要求登录，并校验当前用户在 `group_members` 中为 `owner` 或 `admin`，否则 403。 | 通过 | 无。 |
| 移除成员权限 | **通过**：`DELETE /api/groups/[id]/members?memberId=...` 校验：当前用户为该群成员；若移除他人则须为 owner/admin；不可移除 owner。 | 通过 | 无。 |
| 创建群组权限 | **通过**：`POST /api/groups/create` 要求登录，`owner_id` 与 `participant1_id`/`participant2_id` 设为当前用户，无越权。 | 通过 | 无。 |

---

## 3. 通知系统

### 3.1 页面与接口：`/main/notifications`、通知数据与操作

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 通知仅发给目标用户 | **通过**：业务侧插入通知时均指定 `user_id` 为被通知人；触发器与 API 使用 `user_id` 写入，无发现误写他人 id。 | 通过 | 无。 |
| 用户无法查看他人通知 | **通过**：NotificationList 与 Supabase 查询使用 `.eq('user_id', user.id)`；RLS “Users can view own notifications” 为 `user_id = auth.uid()`，仅能读本人通知。 | 通过 | 无。 |
| 用户无法操作他人通知 | **通过**：标记已读/全部已读为 `.eq('id', id)` 或 `.eq('user_id', user.id)`；RLS “Users can update own notifications” 为 `user_id = auth.uid()`，仅能更新本人通知。 | 通过 | 无。 |
| 通知 INSERT 策略过宽 | **存在问题**：`024_fix_notification_insert_policy.sql` 中策略 “System can insert notifications” 使用 `WITH CHECK (true)`，允许**任意已认证用户**向 `notifications` 表 INSERT 任意行（包括任意 `user_id`）。恶意用户可通过 Supabase 客户端伪造他人通知、骚扰或钓鱼。 | **中** | 收紧 INSERT 策略：若通知仅由触发器/后端写入，触发器应使用 SECURITY DEFINER 或后端使用 service role（可绕过 RLS），并删除或替换为不允许多余客户端 INSERT 的策略；若确需某类客户端写入，应限制为 `user_id = auth.uid()` 或仅允许 admin/support（与 028 一致），避免 `CHECK (true)`。 |

---

## 4. 数据一致性

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 消息已读/未读同步 | **部分**：ChatWindow 在加载消息后对“非本人发送且未读”的消息调用 `update({ is_read: true })`，RLS 允许会话参与者 UPDATE。Realtime 订阅仅收新消息，已读状态依赖再次拉取或后续扩展 Realtime 更新。若多端同时打开，一端标记已读后另一端可能需刷新才看到，属常见取舍。 | **低** | 可选：对 `messages` 的 UPDATE 做 Realtime 订阅，或定期/聚焦时重新拉取，以提升多端已读一致性。 |
| 群组成员变动及时生效 | **部分**：添加/移除成员通过 API 立即写库；列表页通过 `group_members` 查群会话，新成员下次进入列表即可看到。被移除成员因当前 RLS 本就不能看到该群会话（见 1.1），无额外不一致；但若未来修复群组 RLS，需确保移除后立即无法再读该群消息。 | **低** | 修复群组 RLS 后，成员变动无需额外缓存失效逻辑，以服务端/RLS 为准即可。 |

---

## 5. 隐私与安全

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 消息内容是否在日志中明文记录 | **通过**：ChatWindow、ChatList 等处仅 `console.error` 错误对象（如 load/send 失败），未发现将 `message.content` 或私信内容写入日志。 | 通过 | 保持现状；新增逻辑时避免记录消息正文或用户私密内容。 |
| 防止通过接口获取他人私信或通知 | **私聊与通知通过**：消息与通知均经 Supabase 且受 RLS 限制，无开放 API 返回他人私信或通知。**群组**：见 1.1，修复群组 RLS 后需确保无接口可绕过 group_members 查看他人群消息。 | 中（群组依赖 RLS 修复） | 完成群组 RLS 与页面校验后，不新增可绕过 RLS 的读消息/读通知 API。 |

---

## 6. `/api/track` 相关

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| `/api/track/view` | 记录浏览事件（post/product/profile），写入 `view_events`，带 `viewer_id`（可为 null）、`session_id`、`owner_id` 等。不返回任何用户私信或通知；不暴露他人数据。 | 通过 | 无。 |
| `/api/track/critical-path` | 仅接收并打 server log（name/traceId/outcome/durationMs/meta），不涉及消息或通知内容。 | 通过 | 无。 |

---

## 7. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 异常操作是否有日志 | **部分**：ChatWindow、CreateConversation、CreateGroup、groups API 等在错误路径使用 `console.error`，无统一审计格式。群组添加/移除成员、创建群组未使用 `logAudit`。 | **低** | 可选：对群组创建、添加/移除成员等敏感操作使用统一 `logAudit`（不记录消息内容或成员列表敏感信息）。 |
| 日志中敏感信息是否安全 | **通过**：未发现日志中记录消息正文、通知正文或 token；错误日志多为 `error.message` 或接口名。 | 通过 | 保持规范：禁止在日志中记录私信内容、通知正文、密码、token。 |

---

## 8. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | 群组会话/消息 RLS | 仅 participant1/participant2 参与校验，群成员（非群主）无法看到群会话和群消息，群聊对非群主不可用 | **高** | RLS 增加 group_members 条件；/messages/[id] 对群组校验 group_members 成员 |
| 2 | 通知 INSERT 策略 | “System can insert notifications” 使用 CHECK (true)，任意用户可插入任意 user_id 的通知 | **中** | 收紧 INSERT 策略，触发器用 DEFINER/service role，或限制仅本人/admin 可插入 |
| 3 | 消息页未登录重定向 | /messages 未登录仍可打开页面（列表为空） | **低** | 未登录重定向到登录页并带 redirect |
| 4 | 消息已读多端一致 | 已读状态更新后依赖再次拉取，多端可能短暂不一致 | **低** | 可选：Realtime 订阅 message 更新或定期/聚焦时重拉 |
| 5 | 群组操作审计日志 | 群组创建、加人、踢人无统一 logAudit | **低** | 可选：对上述操作增加 logAudit（不记录敏感内容） |

---

## 9. 已采用的正确实践（无需修改）

- **私聊会话**：get_or_create_private_conversation RPC 做封禁与拉黑校验，且对称 (A,B)/(B,A) 去重。
- **私聊消息**：RLS 限制仅会话参与者可 SELECT/INSERT；已读 UPDATE 仅限本人参与会话。
- **会话页**：/messages/[id] 服务端校验 participant1/participant2，非参与者重定向。
- **通知**：RLS 限制 SELECT/UPDATE 为 `user_id = auth.uid()`；前端仅查本人。
- **群组 API**：添加/移除成员均校验 owner/admin 或本人退群，且不可移除 owner。
- **track**：仅写入浏览与关键路径元数据，不返回他人私信或通知。

---

## 10. 修复计划执行状态

| 优先级 | 检查项 | 风险等级 | 状态 | 说明 |
|--------|--------|----------|------|------|
| P1 | 群组会话/消息 RLS | 高 | ✅ 已完成 | 新增迁移 `189_group_conversations_messages_rls.sql`：conversations 的 SELECT/UPDATE/DELETE 与 messages 的 SELECT/INSERT/UPDATE 均增加 `conversation_type = 'group' AND EXISTS (group_members)` 条件；`/messages/[id]` 服务端识别群组并校验当前用户在 `group_members` 中，群组时用会话 name 作为 otherParticipant.display_name 渲染。 |
| P2 | 通知 INSERT 策略 | 中 | ✅ 已完成 | 新增迁移 `190_notifications_insert_rls_restrict.sql`：删除 “System can insert notifications”（CHECK true），新增 “Users can insert own notifications” 仅允许 `user_id = auth.uid()`；admin/support 仍由 “Admins can insert notifications” 覆盖。触发器为他人插入通知需使用 SECURITY DEFINER 或 service role。 |
| P3 | 消息页未登录重定向 | 低 | ✅ 已完成 | `/messages` 增加 `useAuth` + `useEffect` 未登录时重定向到 `/login?redirect=...`，并增加 loading/早期返回避免闪内容。 |
| P3 | 消息已读多端一致 | 低 | 未做 | 可选：Realtime 订阅 message 更新或窗口聚焦/定期拉取。 |
| P3 | 群组操作审计日志 | 低 | ✅ 已完成 | 已为 `POST /api/groups/create`、`POST /api/groups/[id]/members`（添加成员）、`DELETE /api/groups/[id]/members`（移除成员）增加 `logAudit`（action: group_create / group_add_member / group_remove_member），不记录敏感成员列表或消息内容。 |

---

**审计结论**：私聊与通知的权限与数据隔离到位；**群组会话与消息的 RLS 未考虑 group_members，导致非群主无法使用群聊（高）**；**通知表 INSERT 策略过宽，存在伪造他人通知风险（中）**。建议优先修复上述两项，其余为低风险或可选增强。
