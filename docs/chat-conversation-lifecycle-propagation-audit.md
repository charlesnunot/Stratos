# Chat & Conversation Lifecycle — End-to-End Propagation 推演报告

## 修复记录（已实施）

| 问题 | 修复 |
|------|------|
| CreateConversation 查已有用 .single() 导致 0 条抛错、双路径竞态 | CreateConversation 改为统一调用 RPC `getOrCreateConversation(otherUserId)`，创建/跳转成功后 invalidate `['conversations', user.id]`、`['conversationDetails', user.id]` |
| ChatButton 路径创建/跳转后列表不刷新 | ChatButton 在 getOrCreate 成功后 invalidate `['conversations', user.id]`、`['conversationDetails', user.id]` |
| 发消息 API 不校验拉黑/封禁 | POST /api/messages：发送前校验 (1) 当前用户 profile.status 非 banned/suspended → 403；(2) 私聊时对方 profile.status 非 banned/suspended、对方未拉黑当前用户 → 403 |
| 打开会话标记已读后列表未读数不更新 | ChatWindow 内 useQueryClient()，标记已读成功后 invalidate `['conversationDetails', user.id]`、`['conversations', user.id]` |

**未实施**：撤回/删除单条消息（产品未要求）；Realtime 丢包依赖重连/下次 loadMessages（架构层面）。

---

## 推演目标

系统性推演「会话 + 消息从创建到终止」的完整生命周期，验证在 **Chat List、Chat Window、未读数、通知系统、用户在线状态、管理员/举报系统** 中的 **状态一致性、权限正确性、通知准确性**。  
重点：**任何一条消息，在任何状态变化下，不会多、不丢、不乱、不越权。**

---

## 1️⃣ 会话创建阶段

### 场景：用户 A 从 Profile / 帖子 / 商品 / Sidebar 新建聊天发起会话

**代码路径**：
- **Sidebar / ChatButton**：`useConversation().getOrCreateConversation(otherUserId)` → RPC `get_or_create_private_conversation(p_other_id)`，校验拉黑/封禁，对称查 (A,B)/(B,A)，无则 INSERT，有唯一冲突则 SELECT 再返回；成功后 `router.push(/messages/{id})`。
- **CreateConversation（新建会话弹窗）**：先查 `conversations` 满足 `(p1=user OR p2=user) AND (p1=other OR p2=other)`，`.limit(1).single()`；有则跳转，无则 INSERT 后跳转；**未** invalidate `['conversations', user?.id]`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 是否创建重复会话 | ⚠️ 双路径不一致 | RPC 路径对称去重 + 唯一冲突处理；CreateConversation 路径查现有用 `.single()`，无记录时抛错，无法进入「创建」分支 |
| 会话列表是否立即出现 | ❌ CreateConversation 不保证 | 创建成功后未 invalidate `['conversations']`，列表依赖 refetch/staleTime 才出现新会话；ChatButton 路径跳转后列表同样未主动失效 |
| ChatList 排序 | ✅ | 按 `last_message_at` 降序，新会话有 `last_message_at` |
| 会话权限（拉黑/封禁） | ⚠️ 仅 RPC 路径校验 | RPC 内校验对方 status、blocked；CreateConversation 不校验；发消息 API 不校验拉黑/封禁 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "conversation",
  "scenario": "CreateConversation 弹窗内「查已有会话」无则创建",
  "affectedStates": ["chat_list", "chat_window"],
  "observedIssue": "查已有会话使用 .limit(1).single()，当 0 条时 .single() 抛错，catch 后 toast 失败，永远不会执行「创建新会话」；且未过滤 conversation_type='private'，理论上有误匹配风险。",
  "rootCauseGuess": "PostgREST .single() 在 0 行时返回错误，应用未使用 .maybeSingle()。",
  "enhancementSuggestion": "改为 .maybeSingle()，无记录时再 INSERT；并 .eq('conversation_type', 'private')。创建/跳转成功后 invalidateQueries({ queryKey: ['conversations', user?.id] }) 使列表立即出现。",
  "severity": "高"
}
```

```json
{
  "module": "chat",
  "stage": "conversation",
  "scenario": "新建会话成功后会话列表不刷新",
  "affectedStates": ["chat_list"],
  "observedIssue": "CreateConversation 与 ChatButton 路径在创建/跳转后均未 invalidate ['conversations', user?.id]，会话列表不会立即出现新会话，需刷新或等 refetch。",
  "rootCauseGuess": "创建页/跳转逻辑未使用 queryClient.invalidateQueries。",
  "enhancementSuggestion": "创建成功或 getOrCreate 成功后执行 queryClient.invalidateQueries({ queryKey: ['conversations', user?.id] })（CreateConversation 需注入 useQueryClient）。",
  "severity": "中"
}
```

```json
{
  "module": "chat",
  "stage": "conversation",
  "scenario": "发消息 API 不校验拉黑/封禁",
  "affectedStates": ["chat_window", "notifications"],
  "observedIssue": "POST /api/messages 仅校验「是否为会话参与者/群成员」，不校验：对方是否已拉黑当前用户、对方是否 banned/suspended。被拉黑或对方封禁后，若通过直链 /messages/[id] 仍可发消息并触发通知。",
  "rootCauseGuess": "RPC 仅在「创建会话」时校验；发消息时未二次校验关系与状态。",
  "enhancementSuggestion": "发消息前（私聊）：查询对方 profile.status 与 blocked_users，若对方封禁或已拉黑当前用户则 403。",
  "severity": "关键链路"
}
```

---

## 2️⃣ 消息发送与接收阶段

### 场景：连续发送多条文本/图片；双方同时在线 / 一方离线

**代码路径**：ChatWindow 使用 `loadMessages()` 拉历史，Realtime 订阅 `messages` 表 INSERT；发送走 POST /api/messages，成功后乐观更新 + `loadMessages()` 校正。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 消息是否实时显示 | ✅ | Realtime INSERT + 乐观更新，双重保障 |
| 顺序是否严格一致 | ✅ | 历史按 created_at 升序；新消息乐观/Realtime 追加，服务端顺序一致 |
| 图片加载失败兜底 | ⚠️ | MessageBubble 若展示图片，需确认有兜底；未在本次推演深挖 |
| 发送失败重试/回滚 | ✅ | 无乐观先显再删；失败则 handleError，不写入本地列表 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "message",
  "scenario": "Realtime 丢包时未读数与列表一致性",
  "affectedStates": ["chat_window", "unread_count", "chat_list"],
  "observedIssue": "若 Realtime 丢包，ChatWindow 仅依赖 loadMessages 在「发送成功」后校正己方视图；对方若未打开窗口不会 loadMessages，依赖 Realtime 收新消息。对方未读数依赖 conversationDetails 的 refetch，无 Realtime 订阅 messages UPDATE（已读），未读数可能滞后。",
  "rootCauseGuess": "未读数数据源为独立 query，标记已读后未失效该 query。",
  "enhancementSuggestion": "ChatWindow 标记已读成功后 invalidate ['conversationDetails', user?.id] 或 ['conversations', user?.id]，使会话列表未读数立即更新；或为 conversationDetails 增加合理 staleTime/refetchOnWindowFocus。",
  "severity": "中"
}
```

---

## 3️⃣ 未读数 & 通知联动

### 场景：关闭聊天窗口 → 收到新消息 → 再打开会话

**代码路径**：未读数来自 ChatList 的 `conversationDetails` query：`messages` 表 `is_read=false` 且 `sender_id != user.id` 按 conversation_id 聚合。ChatWindow 在 loadMessages 后对该会话内「非己发」消息执行 `update is_read=true`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 未读数是否准确 | ⚠️ 滞后 | 后端已读更新正确；会话列表未读数依赖 conversationDetails 的 refetch，标记已读后未 invalidate，列表未读数可能未清零 |
| 打开会话是否清零 | ✅ 后端 | 打开会话时 loadMessages 会标记该会话未读为已读；列表角标不保证立即更新 |
| 多端是否同步 | ✅ 数据层 | 以 DB 为准；多端需各自 refetch 或 Realtime |
| 通知不重复/不漏发/不打扰当前会话 | ✅ | 通知在 /api/messages 内按接收者插入；未发现「当前会话免打扰」逻辑，产品若需要需加 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "unread",
  "scenario": "打开会话标记已读后会话列表未读数不更新",
  "affectedStates": ["unread_count", "chat_list"],
  "observedIssue": "ChatWindow 在 loadMessages 后对 messages 做 update is_read=true，但未调用 queryClient.invalidateQueries(['conversationDetails', ...] 或 ['conversations', ...])，会话列表的未读角标不会立即清零。",
  "rootCauseGuess": "ChatWindow 未持有 queryClient，标记已读后无法触发列表侧 query 失效。",
  "enhancementSuggestion": "ChatWindow 内使用 useQueryClient()，在标记已读成功后 invalidateQueries({ queryKey: ['conversationDetails', user?.id] }) 及 ['conversations', user?.id]，保证列表未读数立即更新。",
  "severity": "高"
}
```

---

## 4️⃣ 撤回 / 删除消息

### 场景：撤回自己消息、删除自己消息、对方视角查看

**代码路径**：未发现「撤回」或「删除单条消息」的 API 与前端入口；messages 表无 `deleted_at`/`revoked_at` 等软删字段（未全库确认，仅基于当前检索）。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 是否只允许时间窗口内撤回 | N/A | 无撤回功能 |
| UI 是否展示「已撤回」 | N/A | 无 |
| 未读数是否回滚 | N/A | 无撤回/删除 |
| 图片是否彻底不可访问 | N/A | 无删除消息能力 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "revoke",
  "scenario": "无撤回/删除单条消息能力",
  "affectedStates": ["chat_window", "unread_count", "notifications"],
  "observedIssue": "当前无「撤回」或「删除单条消息」的 API 与 UI；若产品需要撤回，需考虑：时间窗口、未读数回滚、通知是否保留/修正、CDN 图片是否仍可访问。",
  "rootCauseGuess": "产品未实现该能力。",
  "enhancementSuggestion": "若需撤回：messages 表增加 revoked_at 或 status；API 只允许发送者在时间窗口内撤回；已读状态若仅针对「未撤回」消息计数，需在未读逻辑中排除已撤回；通知可保留但链接到会话即可。",
  "severity": "低"
}
```

---

## 5️⃣ 举报 & 管理员介入

### 场景：举报消息 → 管理员处理（警告/封禁）

**代码路径**：MessageBubble 内可打开 ReportDialog，reportedType='message'，reportedId=message.id；ReportManagement 按 reported_type/reported_id 拉取消息及 conversation_id，可跳转 `/messages/{conversation_id}`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 举报消息是否可定位上下文 | ✅ | 管理员可拿到 conversation_id 并跳转会话 |
| 被处理后是否禁止继续发言 | ⚠️ | 发消息 API 未根据「举报处理结果」或用户封禁二次校验；封禁依赖 profile.status，需确认封禁后是否禁止发消息 |
| 历史消息如何展示 | ✅ | 无删除消息，历史仍存在 |
| 会话是否强制中断 | ⚠️ | 无「强制关闭会话」逻辑；封禁后若 API 校验 status 则可间接禁止发消息 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "report",
  "scenario": "发消息 API 未校验发送者封禁状态",
  "affectedStates": ["chat_window", "notifications"],
  "observedIssue": "POST /api/messages 未校验当前用户（发送者）的 profile.status；若用户已被封禁，仍可向已有会话发消息并触发通知。",
  "rootCauseGuess": "API 仅校验是否为会话成员，未校验发送者账号状态。",
  "enhancementSuggestion": "发消息前查询当前用户 profile.status，若为 banned/suspended 则 403，并返回明确文案。",
  "severity": "关键链路"
}
```

---

## 6️⃣ 权限 / 状态变化推演

### 场景：拉黑对方、被对方拉黑、账号被封、解封后恢复

**代码路径**：RPC `get_or_create_private_conversation` 内校验「对方是否拉黑当前用户」与「对方 status」；发消息 API 不校验；直链 /messages/[id] 仅校验是否为参与者/群成员，不校验拉黑/封禁。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 会话是否冻结 | ⚠️ | 拉黑/封禁后仍可打开已有会话直链，输入框未禁用 |
| 输入框是否禁用 | ❌ | 未根据拉黑/封禁禁用发送 |
| 解封后是否可继续 | ✅ | 数据仍在，解封后可继续 |
| 未读数是否异常积累 | ✅ | 未读数按消息计，无异常逻辑 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "permission",
  "scenario": "拉黑/封禁后仍可通过直链发消息",
  "affectedStates": ["chat_window", "notifications"],
  "observedIssue": "被对方拉黑或己方/对方封禁后，通过直链 /messages/[id] 仍可打开会话并发送消息；RPC 仅在新创建会话时校验，已有会话发消息无二次校验。",
  "rootCauseGuess": "发消息 API 与前端均未在「发送前」校验拉黑关系与双方 status。",
  "enhancementSuggestion": "发消息 API：私聊时校验 (1) 对方未拉黑当前用户 (2) 对方与当前用户 profile.status 均非 banned/suspended；前端在加载会话时可选拉取「是否被拉黑/是否封禁」并禁用输入框与发送按钮。",
  "severity": "关键链路"
}
```

---

## 7️⃣ 边界 & 极端场景

### 双方同时撤回、网络断连重连、快速切换会话、多设备同时登录

| 场景 | 结论 | 说明 |
|------|------|------|
| 双方同时撤回 | N/A | 无撤回功能 |
| 网络断连后重连 | ⚠️ | Realtime 重连后可能漏事件；发送成功后有 loadMessages 校正，己方视图一致；对方依赖 Realtime 或下次进入 loadMessages |
| 快速切换会话 | ⚠️ | 每个 conversationId 独立 channel，切换时 unsubscribe；loadMessages 按当前 conversationId，无错乱；未读数可能仍为旧会话的 refetch 节奏 |
| 多设备同时登录 | ✅ | 以 DB 为准；各端 Realtime 独立，未读数各端 refetch 后一致 |

**发现问题**：

```json
{
  "module": "chat",
  "stage": "message",
  "scenario": "CreateConversation 与 RPC 双路径并发创建同一会话",
  "affectedStates": ["chat_list", "chat_window"],
  "observedIssue": "用户 A 从 Sidebar 用 ChatButton（RPC）与从「新建会话」用 CreateConversation 同时发起与 B 的会话，可能 RPC 已创建而 CreateConversation 查询用 .single() 抛错，或 CreateConversation 先 INSERT 导致唯一约束冲突（若存在 (p1,p2,type) 唯一）。双路径未统一为单一入口易产生竞态。",
  "rootCauseGuess": "存在两套创建会话逻辑，且 CreateConversation 查询/插入未与 RPC 行为对齐。",
  "enhancementSuggestion": "统一入口：新建私聊一律通过 RPC get_or_create_private_conversation（或同一后端 API），前端 CreateConversation 改为调用该 RPC/API，避免重复实现与竞态。",
  "severity": "中"
}
```

---

## 判断标准（最终结论）

> **「任何一条消息，在任何状态变化下，不会多、不丢、不乱、不越权。」**

**当前结论**：**在已实施修复后，不越权已满足**；不丢仍依赖 Realtime/重连。

| 维度 | 状态 | 说明 |
|------|------|------|
| 不多 | ✅ | 有 appendMessageDeduped 去重；无重复插入逻辑 |
| 不丢 | ⚠️ | Realtime 丢包时对方依赖重连或下次 loadMessages；发送侧有校正 |
| 不乱 | ✅ | 顺序以 created_at 为准，无乱序逻辑 |
| 不越权 | ✅ 已修复 | 发消息 API 已校验发送者/对方封禁及对方拉黑当前用户；会话创建统一走 RPC；标记已读后 invalidate 未读数 |

**剩余建议**：撤回/删除单条消息若产品需要再设计；Realtime 丢包可考虑服务端已读同步或短轮询兜底。

---

## 输出汇总（JSON 列表，按 stage 排序）

```json
[
  {"module":"chat","stage":"conversation","scenario":"CreateConversation 弹窗内「查已有会话」无则创建","affectedStates":["chat_list","chat_window"],"observedIssue":"查已有会话使用 .limit(1).single()，当 0 条时 .single() 抛错，永远不会执行「创建新会话」；且未过滤 conversation_type='private'。","rootCauseGuess":"PostgREST .single() 在 0 行时返回错误，应用未使用 .maybeSingle()。","enhancementSuggestion":"改为 .maybeSingle()，无记录时再 INSERT；并 .eq('conversation_type', 'private')。创建/跳转成功后 invalidateQueries(['conversations', user?.id])。","severity":"高"},
  {"module":"chat","stage":"conversation","scenario":"新建会话成功后会话列表不刷新","affectedStates":["chat_list"],"observedIssue":"CreateConversation 与 ChatButton 路径在创建/跳转后均未 invalidate ['conversations', user?.id]，会话列表不会立即出现新会话。","rootCauseGuess":"创建页/跳转逻辑未使用 queryClient.invalidateQueries。","enhancementSuggestion":"创建成功或 getOrCreate 成功后执行 queryClient.invalidateQueries({ queryKey: ['conversations', user?.id] })。","severity":"中"},
  {"module":"chat","stage":"conversation","scenario":"发消息 API 不校验拉黑/封禁","affectedStates":["chat_window","notifications"],"observedIssue":"POST /api/messages 仅校验是否为会话参与者，不校验对方是否已拉黑当前用户、对方是否 banned/suspended。被拉黑或对方封禁后仍可发消息并触发通知。","rootCauseGuess":"RPC 仅在「创建会话」时校验；发消息时未二次校验。","enhancementSuggestion":"发消息前（私聊）：查询对方 profile.status 与 blocked_users，若对方封禁或已拉黑当前用户则 403。","severity":"关键链路"},
  {"module":"chat","stage":"message","scenario":"Realtime 丢包时未读数与列表一致性","affectedStates":["chat_window","unread_count","chat_list"],"observedIssue":"对方未打开窗口时依赖 Realtime 收新消息；未读数依赖 conversationDetails refetch，无 Realtime 订阅 messages UPDATE，未读数可能滞后。","rootCauseGuess":"未读数数据源为独立 query，标记已读后未失效该 query。","enhancementSuggestion":"ChatWindow 标记已读成功后 invalidate ['conversationDetails', user?.id]，使会话列表未读数立即更新。","severity":"中"},
  {"module":"chat","stage":"unread","scenario":"打开会话标记已读后会话列表未读数不更新","affectedStates":["unread_count","chat_list"],"observedIssue":"ChatWindow 在 loadMessages 后对 messages 做 update is_read=true，但未 invalidate conversationDetails/conversations，会话列表的未读角标不会立即清零。","rootCauseGuess":"ChatWindow 未持有 queryClient，标记已读后无法触发列表侧 query 失效。","enhancementSuggestion":"ChatWindow 内 useQueryClient()，标记已读成功后 invalidateQueries({ queryKey: ['conversationDetails', user?.id] }) 及 ['conversations', user?.id]。","severity":"高"},
  {"module":"chat","stage":"revoke","scenario":"无撤回/删除单条消息能力","affectedStates":["chat_window","unread_count","notifications"],"observedIssue":"当前无「撤回」或「删除单条消息」的 API 与 UI。","rootCauseGuess":"产品未实现该能力。","enhancementSuggestion":"若需撤回：messages 增加 revoked_at 或 status；API 只允许发送者在时间窗口内撤回；未读逻辑排除已撤回。","severity":"低"},
  {"module":"chat","stage":"report","scenario":"发消息 API 未校验发送者封禁状态","affectedStates":["chat_window","notifications"],"observedIssue":"POST /api/messages 未校验当前用户（发送者）的 profile.status；若用户已被封禁，仍可向已有会话发消息并触发通知。","rootCauseGuess":"API 仅校验是否为会话成员，未校验发送者账号状态。","enhancementSuggestion":"发消息前查询当前用户 profile.status，若为 banned/suspended 则 403。","severity":"关键链路"},
  {"module":"chat","stage":"permission","scenario":"拉黑/封禁后仍可通过直链发消息","affectedStates":["chat_window","notifications"],"observedIssue":"被对方拉黑或己方/对方封禁后，通过直链 /messages/[id] 仍可打开会话并发送消息。","rootCauseGuess":"发消息 API 与前端均未在发送前校验拉黑关系与双方 status。","enhancementSuggestion":"发消息 API：私聊时校验对方未拉黑当前用户、双方 profile.status 均非 banned/suspended；前端可选禁用输入框。","severity":"关键链路"},
  {"module":"chat","stage":"message","scenario":"CreateConversation 与 RPC 双路径并发创建同一会话","affectedStates":["chat_list","chat_window"],"observedIssue":"两套创建会话逻辑，易产生竞态；CreateConversation 查询/插入未与 RPC 行为对齐。","rootCauseGuess":"存在两套创建会话逻辑。","enhancementSuggestion":"统一入口：新建私聊一律通过 RPC get_or_create_private_conversation，CreateConversation 改为调用该 RPC。","severity":"中"}
]
```

**Severity 分布**：关键链路 3，高 2，中 4，低 1。
