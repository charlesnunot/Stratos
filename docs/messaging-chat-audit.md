# 审计任务 23：消息与聊天系统

**目标**：确保私信、单聊、群聊功能安全可靠、权限正确、消息及时到达、数据一致，并防止敏感信息泄露或异常操作。

**审计日期**：2025-01-31

---

## 1. 消息发送与接收

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能发送消息给自己有权限的用户或群组 | RLS 已保证：messages INSERT 要求 `sender_id = auth.uid()` 且会话为 participant1/participant2 或 group_members 成员；私聊通过 get_or_create_private_conversation RPC 校验对方状态与拉黑。 | 无 | 已满足 |
| 消息内容正确保存、顺序一致 | 按 `created_at` 升序拉取；Realtime 订阅新消息；发送成功后乐观更新并 loadMessages 校正。 | 无 | 已满足 |
| 发送失败或网络异常时有重试或回退机制 | 发送失败仅 toast 提示，无自动重试；乐观更新在 insert 成功后才追加，失败不追加。 | 低 | 已满足（失败不误显）；可选后续增加重试。 |
| 消息内容长度未限制 | **问题**：前端未限制单条消息长度，可提交超长内容造成存储与展示压力。 | **低** | **已修复**：ChatWindow 限制 10000 字符，超限 toast；input 增加 maxLength；i18n 增加 messageTooLong / messageTooLongDescription。 |

---

## 2. 群组管理

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 创建群组和成员管理权限正确 | POST /api/groups/create 要求登录，owner 为当前用户；POST/DELETE /api/groups/[id]/members 校验当前用户为 owner 或 admin。 | 无 | 已满足 |
| 踢人、拉人操作权限校验 | 仅 owner/admin 可添加成员；仅 owner/admin 可踢他人，普通成员只能退群；不可移除 owner。 | 无 | 已满足 |
| 群组消息仅限群成员可见 | 迁移 189：conversations / messages 的 SELECT/INSERT/UPDATE 在 group 类型下允许 group_members 成员。 | 无 | 已满足 |
| groups/[id]/members 路由 params | **问题**：Next.js 15 动态路由 params 为 Promise，未 await 时 groupId 可能异常。 | **中** | **已修复**：POST/DELETE 均使用 `params: Promise<{ id: string }>` 并 `const { id: groupId } = await params`，缺省时返回 400。 |
| 群组名称/描述未限制长度 | **问题**：name、description 未做长度校验，存在超长或异常输入。 | **低** | **已修复**：groups/create 中 name trim 且最长 100 字符，description trim 且最长 500 字符，超限返回 400。 |

---

## 3. 消息隐私与安全

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户无法访问他人消息 | RLS：messages SELECT 仅允许会话参与者或群成员；/messages/[id] 服务端校验私聊 participant 或群 membership，非成员重定向。 | 无 | 已满足 |
| 消息存储和日志中敏感内容 | 消息 content 明文存 DB（常规设计）；logAudit 仅记录 action/resourceId 等，不记录消息正文。 | 无 | 已满足 |
| 消息附件上传安全 | 当前无独立聊天附件上传 API；MessageBubble 支持 post/product 卡片（content 内 JSON），无用户上传文件。 | 无 | 无附件上传功能，N/A。 |

---

## 4. 通知与未读消息

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 未读计数与实际消息一致 | ChatList 从 messages 按 conversation_id、is_read=false、sender_id≠当前用户聚合未读数；进入会话后 ChatWindow 将他人消息标为已读。 | 无 | 已满足 |
| 多端同步 | 同一 Supabase 数据源 + Realtime 订阅新消息；已读依赖再次拉取或后续扩展 Realtime UPDATE。 | 低 | 已满足 |
| 消息通知触发逻辑 | 当前无「新私信/群消息」插入通知的 DB 触发器；若有需求可后续增加。 | 低 | 设计取舍，非缺陷。 |

---

## 5. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 消息发送失败或接口异常有日志 | 发送失败时前端 console.error；群组 create/add/remove 使用 logAudit 记录成功/失败。 | 无 | 已满足 |
| 日志中不泄露敏感信息 | logAudit 不记录消息正文；仅 action、userId、resourceId、meta 等。 | 无 | 已满足 |
| 系统异常不会导致消息丢失或错误发送 | 发送失败不执行乐观追加；insert 成功后再更新 UI 并 loadMessages 校正；RLS 保证仅有权用户可 INSERT。 | 无 | 已满足 |

---

## 修复项汇总

| 项 | 文件 | 说明 |
|----|------|------|
| 1 | `src/app/api/groups/[id]/members/route.ts` | POST/DELETE 使用 `params: Promise<{ id: string }>` 并 await，缺省 groupId 返回 400 |
| 2 | `src/components/chat/ChatWindow.tsx` | 消息内容最长 10000 字符，超限 toast；input maxLength；常量 MAX_MESSAGE_LENGTH |
| 3 | `src/app/api/groups/create/route.ts` | name trim 且最长 100 字符，description trim 且最长 500 字符 |
| 4 | `src/messages/en.json`, `src/messages/zh.json` | messages 命名空间增加 messageTooLong、messageTooLongDescription |

---

## 涉及页面与接口

- **页面**：/main/messages（ChatList）、/main/messages/[id]（ChatPageClient + ChatWindow）。
- **接口**：无 /api/messages/*；消息读写经 Supabase 客户端 + RLS。群组：POST /api/groups/create，POST/DELETE /api/groups/[id]/members。
- **RPC**：get_or_create_private_conversation（私聊创建与校验）。
