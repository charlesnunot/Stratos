# Content Lifecycle End-to-End Propagation (Post) — 推演报告

## 推演目标

系统性推演「帖子内容从诞生到消亡」全过程中，所有功能模块是否正确联动、状态是否一致、是否存在隐藏断裂点。重点：**帖子状态变化后，整个系统是否同步响应**。

---

## 修复记录（已落地）

| 问题 | 修复方式 |
|------|----------|
| 话题页数据源 `topic_ids` 与 schema 不一致 | `usePosts.ts` 中 `fetchTopicPosts` 改为通过 `post_topics!inner` 关联查询，过滤 `topics.topic_id` |
| 创建/编辑/删除帖后 Feed、收藏未失效 | 创建页、编辑页、`usePostActions.deletePost` 中增加 `invalidateQueries(['feed'])`；创建/编辑增加 `invalidateQueries(['favorites', user.id])` |
| 驳回后直链仍可见、收藏无占位 | `usePostPage`：非作者且非管理员时，若 `status !== 'approved'` 返回 `unavailable`；`FavoriteItem` 拉帖时带 `status`，非 approved 时展示「已下架」占位且不提供跳转 |
| 无「已通过内容下架」与「驳回后恢复」 | `content-review/[id]/reject` 允许从 `pending` 或 `approved`(post)/`active`(product) 驳回；`content-review/[id]/approve` 允许从 `pending` 或 `rejected` 恢复 |
| 删评后 comment_count | 已由 `161_fix_comment_security_constraints.sql` 中 `update_post_comment_count_trigger` 维护，无需改代码 |

---

## 1️⃣ 帖子创建阶段

### 场景：用户发布帖子（含图片 / 话题 / 位置）→ 发布成功

**代码路径**：`post/create/page.tsx` 直接写 `posts` + `post_topics`，`status: 'pending'`；成功后 `invalidateQueries(['posts'], ['post', post.id], ['posts', 'pending'])`，`router.push(/post/{id})`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| Feed 是否立即出现 | ❌ 不出现（符合预期） | 新帖为 pending，Feed RPC 与 usePosts('approved') 均只取 approved，故不会出现在 Feed |
| Topic 页面是否出现 | ❌ 不出现（符合预期） | 话题页仅拉 status=approved，pending 不会出现 |
| 用户 Profile 帖子列表是否出现 | ⚠️ 取决于 Profile 查询 | 本人用 useUserPosts(userId, undefined) 会显示；他人用 useUserPosts(userId, 'approved') 不显示 |
| 搜索是否可检索 | ❌ 不可检索 | Search 仅查 status=approved |
| URL 直达是否可访问 | ✅ 可访问 | usePost(id) 不按 status 过滤，直链可打开；usePostPage 仍渲染内容，仅互动能力受 isApproved 限制 |
| Feed 排序 | N/A | 未进入 Feed |

**发现问题**（已修复 ✅）：

```json
{
  "contentType": "post",
  "stage": "create",
  "scenario": "用户发布帖子成功后，Feed/Topic/Profile 等入口的缓存失效范围",
  "affectedModules": ["Feed", "Topic", "Profile", "Search"],
  "observedIssue": "创建成功后只 invalidate ['posts']、['post', post.id]、['posts','pending']，未 invalidate ['feed', userId, ...]。审核通过后 Feed 也不会被主动失效，需等 staleTime(30s) 或用户操作才刷新。",
  "rootCauseGuess": "创建页与 Feed 使用不同 queryKey（feed vs posts），审核通过在服务端完成，前端无统一失效入口。",
  "enhancementSuggestion": "审核通过 API 可触发通知或 WebSocket，前端收到后 invalidateQueries({ queryKey: ['feed'] }) 与 ['posts']；或创建后若业务允许，对 Feed 做 prefix 失效。",
  "severity": "中",
  "fixed": "创建成功后已增加 invalidateQueries(['feed']) 与 invalidateQueries(['favorites', user.id])。"
}
```

```json
{
  "contentType": "post",
  "stage": "create",
  "scenario": "话题页按话题拉帖子的数据源",
  "affectedModules": ["Topic"],
  "observedIssue": "fetchTopicPosts 使用 posts.contains('topic_ids', [topicId])，而 001_initial_schema 中 posts 表无 topic_ids 列，仅存在 post_topics 关联表；若 DB 未在后续迁移中增加 topic_ids，话题页会报错或无数据。",
  "rootCauseGuess": "TypeScript 类型与文档假定 posts 有 topic_ids 数组；实际 schema 可能仅通过 post_topics 关联。",
  "enhancementSuggestion": "确认 DB 是否有 topic_ids 列或等价视图；若无，改为通过 post_topics 关联查询（如 from('posts').select().in('id', subquery of post_ids from post_topics where topic_id=?) 或 RPC）。",
  "severity": "高",
  "fixed": "fetchTopicPosts 已改为 post_topics!inner 关联查询，过滤 topics.topic_id。"
}
```

---

## 2️⃣ 帖子编辑阶段

### 场景：编辑帖子内容/图片/话题 → 保存成功

**代码路径**：`post/[id]/edit/page.tsx` 更新 `posts` 与 `post_topics`，成功后 `invalidateQueries(['posts'], ['post', postId], ['userPosts'])`，`router.push(/post/postId)`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| Feed 是否实时更新 | ❌ 不保证 | 未 invalidate ['feed']，Feed 依赖 staleTime/refetch 才更新 |
| Post Detail 是否更新 | ✅ 更新 | ['post', postId] 已失效，详情页会拉最新 |
| 收藏列表是否同步 | ⚠️ 仅列表项内容 | 收藏列表拉的是 favorites 表 + 按 item_id 查帖子；帖子更新后 FavoriteItem 的 queryKey 为 ['favoriteContent', type, item_id]，未在编辑成功时失效，需等缓存过期或重新进入页面 |
| 分享链接是否最新 | ✅ 是 | 详情页已失效，直链打开会拿到最新内容 |
| 编辑失败时回滚 | ✅ 有 | 前端未乐观覆盖；post_topics 先 delete 再 insert，若 insert 失败需调用方自行回滚 posts 或加事务（当前为客户端顺序调用） |

**发现问题**（已修复 ✅）：

```json
{
  "contentType": "post",
  "stage": "edit",
  "scenario": "编辑帖子保存后 Feed / 收藏列表展示",
  "affectedModules": ["Feed", "Favorite"],
  "observedIssue": "编辑成功后未 invalidate ['feed'] 与 ['favorites', userId]，Feed 与收藏列表可能仍显示旧文案/旧图直到缓存失效或刷新。",
  "rootCauseGuess": "编辑页只失效了 ['posts']、['post', postId]、['userPosts']，未覆盖 Feed 与 favorites 的 queryKey。",
  "enhancementSuggestion": "保存成功后增加 queryClient.invalidateQueries({ queryKey: ['feed'] }) 与 queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })（或按 prefix 批量失效）。",
  "severity": "中",
  "fixed": "编辑成功后已增加 invalidateQueries(['feed']) 与 invalidateQueries(['favorites', user.id])。"
}
```

---

## 3️⃣ 社交互动阶段

### 点赞 / 评论 / 收藏 / 转发

**代码路径**：LikeButton/FavoriteButton 有 realtime + invalidate(['post', postId], ['posts'])；CommentSection 有 realtime + invalidate(['comments', postId], ['post', postId])；收藏 toggle 会 invalidate ['post', postId]、['posts']、['favorites']；转发为 reposts 表 + 可选通知。

| 检查点 | 结论 |
|--------|------|
| 各计数一致 | ✅ 点赞/评论有 realtime 或 invalidate，post 与列表会更新；收藏数在 FavoriteButton 侧有 invalidate |
| PostCard / Detail / Profile 同步 | ✅ 通过 ['post', postId] 与 ['posts'] 失效可同步 |
| 评论影响排序 | ✅ Feed RPC 使用 like_count/comment_count/tip_amount + 时间衰减，DB 计数由 trigger 维护 |
| 收藏后在 Favorite 页面出现 | ✅ useFavorites 拉 favorites 表，toggle 已 invalidate ['favorites', user?.id] |
| 转发引用关系 | ✅ reposts 表记录 item_type/item_id，未发现幽灵引用 |

**发现问题**（已确认 ✅）：

```json
{
  "contentType": "post",
  "stage": "interact",
  "scenario": "删除评论后帖子 comment_count",
  "affectedModules": ["Feed", "Profile", "Topic", "Post Detail"],
  "observedIssue": "需确认 comments 表删除或状态变更是否有 trigger 更新 posts.comment_count；若未更新则 PostCard/Detail 会与真实评论数不一致。",
  "rootCauseGuess": "计数一致性依赖 DB trigger 或应用层在删评时更新 post。",
  "enhancementSuggestion": "确认 004_update_counts_triggers 或等价迁移中是否包含 comments 删除/更新时对 posts.comment_count 的维护；若无则补充 trigger 或删评 API 内显式更新。",
  "severity": "中",
  "fixed": "已确认 161_fix_comment_security_constraints.sql 中 update_post_comment_count_trigger 在 INSERT/DELETE/UPDATE 时维护 posts.comment_count，无需改代码。"
}
```

---

## 4️⃣ 举报阶段

### 场景：用户举报帖子

**代码路径**：ReportDialog 向 `reports` 表 insert(reporter_id, reported_type='post', reported_id)；Feed RPC `get_personalized_feed` 排除「当前用户举报过的 post_id」及「举报过的作者」。

| 检查点 | 结论 |
|--------|------|
| 举报是否可重复提交 | 未限制同一 (reporter, reported_type, reported_id) 多条；若业务要求防重复需加唯一约束或前端去重 |
| 被举报内容是否仍正常可见 | ✅ 对其他人仍可见，仅对举报者本人从 Feed 排除 |
| 举报状态是否影响推荐权重 | ✅ 影响举报者 Feed：被举报帖子与作者均从 RPC 排除 |
| 管理员是否可追溯原始内容 | ✅ ReportManagement 按 reported_type/reported_id 拉取 post 等原文，链接到 /post/{id} |

```json
{
  "contentType": "post",
  "stage": "report",
  "scenario": "同一用户对同一帖子多次举报",
  "affectedModules": ["Admin"],
  "observedIssue": "reports 表未发现 (reporter_id, reported_type, reported_id) 唯一约束，同一用户可对同一帖子提交多份举报，管理员列表可能重复。",
  "rootCauseGuess": "产品未要求防重复举报或未在 DB 层约束。",
  "enhancementSuggestion": "若业务要求一人一帖只保留一条举报：增加唯一约束或 upsert；管理员列表可按 (reported_type, reported_id) 去重展示。",
  "severity": "低"
}
```

---

## 5️⃣ 管理员下架 / 审核阶段

### 场景：管理员驳回 / 下架帖子（当前仅支持对 pending 驳回 → status=rejected）

**代码路径**：`api/admin/content-review/[id]/reject/route.ts` 仅处理 `status === 'pending'`，更新为 `status: 'rejected'`。无对「已 approved 帖子」的二次下架 API。

| 检查点 | 结论 |
|--------|------|
| Feed 是否消失 | ✅ RPC 与 usePosts('approved') 均按 status=approved，rejected 不会出现 |
| Topic 是否消失 | ✅ 话题页仅 approved，会消失 |
| 搜索是否不可见 | ✅ Search 仅 approved，会消失 |
| 收藏中的帖子如何展示 | ⚠️ 仍显示：FavoriteItem 按 item_id 查 posts 且不筛 status，rejected 帖仍能查到，展示为「正常卡片+可点进详情」；仅当帖子被物理删除时显示「已删除」占位 |
| 直链访问返回什么 | ⚠️ 仍返回正文：usePost(id) 不按 status 过滤，usePostPage 渲染完整内容，仅 canComment/canLike/canRepost 等为 false，无「已下架」提示 |
| 评论是否还能访问 | ✅ 评论列表按 post_id 拉取，帖子存在即可见；详情页仍展示评论区 |
| 转发内容是否受影响 | 转发记录在 reposts 表，原帖 status 变更不自动改 reposts；展示转发时若再查原帖会拿到 rejected 状态，取决于前端是否按 status 隐藏 |

**发现问题**：

```json
{
  "contentType": "post",
  "stage": "moderate",
  "scenario": "管理员驳回帖子后，直链与收藏列表行为",
  "affectedModules": ["Favorite", "Post Detail"],
  "observedIssue": "驳回后直链 /post/{id} 仍可打开并显示完整内容（仅互动禁用）；收藏列表仍展示该帖且可点进详情，无「已下架」占位或移除。易被理解为「下架后仍能通过某入口访问」，且前台无明确状态提示。",
  "rootCauseGuess": "usePost(postId) 与 FavoriteItem 的 favoriteContent 查询均未过滤 status；产品未要求「下架即不可见」。",
  "enhancementSuggestion": "方案 A：前台展示层统一策略——usePost 或服务端接口对非作者/非管理员只返回 status=approved 的帖子，否则 404 或返回占位「内容已下架」。方案 B：保留直链可读，但在详情页与收藏卡片显式展示「已下架」标识并禁用互动。同时收藏列表可过滤掉非 approved 的帖子或显示占位。",
  "severity": "关键链路"
}
```

```json
{
  "contentType": "post",
  "stage": "moderate",
  "scenario": "对已通过帖子的「再次下架」",
  "affectedModules": ["Admin", "Feed", "Topic", "Search", "Favorite"],
  "observedIssue": "当前仅支持对 pending 的 reject，无「将已 approved 帖子改为 rejected/hidden」的接口，无法对已上线内容做事后下架。",
  "rootCauseGuess": "content-review reject 仅允许 status===pending 时更新。",
  "enhancementSuggestion": "若需「下架已通过内容」：新增 API（如 PATCH /api/admin/content-review/[id]/take-down）或将 reject 扩展为允许从 approved 改为 rejected/hidden，并通知作者；同时确保 Feed/Topic/Search/直链/收藏行为与「驳回」一致。",
  "severity": "高"
}
```

---

## 6️⃣ 边界与逆序推演

### 帖子被下架后：再恢复 / 再删除 / 用户删帖 / 管理员恢复

| 场景 | 结论 |
|------|------|
| 驳回后再恢复 | 当前无「将 rejected 改回 approved」的 API，需新增或扩展 content-review approve 允许从 rejected 恢复 |
| 驳回后再删除 | 用户删帖为物理 delete；驳回帖作者仍可删，删除后收藏/直链会 404 或「已删除」占位（FavoriteItem 已处理 content 为空） |
| 用户删除自己帖子 | usePostActions 中 delete 为物理删除；invalidate ['posts'], ['userPosts'], ['post', id]；未 invalidate ['feed']，Feed 的 RPC 可能仍返回该 id，客户端 fetch 帖子详情时 byId.get(id) 为 undefined 被 filter 掉，表现为 Feed 少一条而非幽灵卡片 |
| 管理员恢复帖子 | 无「rejected → approved」流程，需产品与接口扩展 |

```json
{
  "contentType": "post",
  "stage": "moderate",
  "scenario": "用户删除自己帖子后 Feed 数据源",
  "affectedModules": ["Feed"],
  "observedIssue": "删除后未 invalidate ['feed']。Feed 先 RPC 取 id 列表再按 id 拉帖子；若某 id 已被删，第二次查询拿不到该行，结果列表会少一条，不会出现「幽灵卡片」，但可能短暂出现空位或数量与预期不符。",
  "rootCauseGuess": "删除帖只失效了 posts/post/userPosts，未失效 feed；RPC 不感知行级删除，仍可能返回已删 id。",
  "enhancementSuggestion": "用户删帖成功后 invalidateQueries({ queryKey: ['feed'] })（或 prefix ['feed']），使 Feed 重新拉取 id 列表与帖子，避免使用已删 id。",
  "severity": "中"
}
```

```json
{
  "contentType": "post",
  "stage": "moderate",
  "scenario": "驳回后恢复 / 管理员恢复帖子",
  "affectedModules": ["Admin", "Feed", "Topic", "Profile", "Search"],
  "observedIssue": "无「rejected → approved」的恢复接口，驳回后无法在现有 API 下恢复为上线状态；若未来有恢复，需同步 invalidate Feed/Topic/Profile/Search 及 ['post', id]。",
  "rootCauseGuess": "content-review approve 仅允许 status===pending。",
  "enhancementSuggestion": "新增恢复 API 或将 approve 扩展为：当 status 为 rejected 时也可更新为 approved，并触发与「审核通过」相同的通知与缓存失效策略。",
  "severity": "中"
}
```

---

## 幽灵引用结论

**问题**：「一个帖子在任何状态变化后，Stratos 中不存在『幽灵引用』」是否成立？

**结论**：**不能完全自信回答「不存在」**，存在以下缺口：

1. **直链与收藏的「半可见」**  
   驳回/下架后，帖子仍可通过直链打开并显示正文，收藏列表仍展示并可点进。从「状态一致」角度，这是**有意保留的引用**，但缺少「已下架」的明确提示，容易被当成「幽灵可见」。

2. **Feed 在删帖/状态变更后的时效性**  
   用户删帖或后台驳回后，未对 `['feed']` 做失效，Feed 依赖 RPC 返回的 id 再拉帖子；已删帖 id 在第二次请求中会缺失，不会渲染出幽灵卡片，但可能产生**空位或条数短时不一致**；若 RPC 层缓存了 id 列表，则存在理论上的陈旧引用。

3. **话题页数据源**  
   若 DB 实际没有 `posts.topic_ids` 而代码使用 `contains('topic_ids', [topicId])`，话题页会报错或无数据，属于**数据源与 schema 不一致**的断裂，而非典型幽灵引用。

**建议**：  
- 明确产品策略：下架/驳回后直链与收藏是「不可见」还是「可见但仅读+提示」；  
- 统一在**详情与列表**对非 approved 帖子做过滤或占位，并在**所有写操作（创建/编辑/删除/审核/恢复）**中显式失效 Feed、Topic、Profile、Search、Favorite、Post 等相关 queryKey；  
- 确认话题页使用 `topic_ids` 还是 `post_topics`，并统一 schema 与查询。  

在完成上述增强后，可更接近「帖子状态变化后，全系统同步响应且无幽灵引用」的目标。

---

## 输出汇总（JSON 列表）

以上各条已按约定格式写成独立 JSON；汇总如下（按 stage 排序）：

1. create — 创建后 Feed/审核通过后未失效；话题页 topic_ids 与 schema 不一致风险  
2. edit — 编辑后 Feed、收藏列表未失效  
3. interact — 删评后 comment_count 需确认 trigger  
4. report — 举报可重复提交  
5. moderate — 驳回后直链/收藏仍可见且无下架提示；无「已通过内容下架」与「驳回后恢复」API  
6. moderate（边界）— 用户删帖未失效 Feed；无管理员恢复帖子流程  

**Severity 分布**：关键链路 1，高 2，中 5，低 1。

---

## 判断标准（最终结论）

> **「一个帖子在任何状态变化后，Stratos 中不存在『幽灵引用』。」**

**当前结论**：**尚不能完全自信回答「是」**。

| 维度 | 状态 | 说明 |
|------|------|------|
| 列表类入口（Feed / Topic / Profile / Search） | ✅ 无幽灵卡片 | 均按 `status=approved` 或 RPC 过滤；已删帖 id 在二次拉取时缺失会从列表消失，不会渲染成幽灵 |
| 直链 `/post/[id]` | ⚠️ 半可见 | 驳回/下架后仍可打开并显示正文（无 status 过滤），属「有意保留的引用」但缺「已下架」提示，易被当成幽灵可见 |
| 收藏列表 | ⚠️ 半可见 | 下架帖仍以正常卡片展示且可点进详情，仅物理删除时显示「已删除」占位 |
| 转发 / 评论 / 点赞引用 | ✅ 无幽灵 | reposts / comments / likes 指向 post_id，帖子存在即有效；删除后为物理删除，无悬空引用 |
| Feed 时效性 | ⚠️ 滞后 | 删帖/驳回后未 invalidate `['feed']`，可能短时空位或条数不一致，RPC 若缓存 id 则有理论陈旧引用 |

**要达到「不存在幽灵引用」需补齐**：  
1）明确下架后直链/收藏策略（不可见 vs 可见+占位提示）；  
2）详情与收藏处对非 approved 做过滤或显式「已下架」提示；  
3）所有写操作（创建/编辑/删除/审核/恢复）统一失效 Feed 等相关 queryKey；  
4）确认话题页数据源（`topic_ids` vs `post_topics`）与 DB 一致。

---

## 可复制 JSON 数组（按 stage 排序）

```json
[
  {"contentType":"post","stage":"create","scenario":"用户发布帖子成功后，Feed/Topic/Profile 等入口的缓存失效范围","affectedModules":["Feed","Topic","Profile","Search"],"observedIssue":"创建成功后只 invalidate ['posts']、['post', post.id]、['posts','pending']，未 invalidate ['feed', userId, ...]。审核通过后 Feed 也不会被主动失效，需等 staleTime(30s) 或用户操作才刷新。","rootCauseGuess":"创建页与 Feed 使用不同 queryKey（feed vs posts），审核通过在服务端完成，前端无统一失效入口。","enhancementSuggestion":"审核通过 API 可触发通知或 WebSocket，前端收到后 invalidateQueries({ queryKey: ['feed'] }) 与 ['posts']；或创建后若业务允许，对 Feed 做 prefix 失效。","severity":"中"},
  {"contentType":"post","stage":"create","scenario":"话题页按话题拉帖子的数据源","affectedModules":["Topic"],"observedIssue":"fetchTopicPosts 使用 posts.contains('topic_ids', [topicId])，而 001_initial_schema 中 posts 表无 topic_ids 列，仅存在 post_topics 关联表；若 DB 未在后续迁移中增加 topic_ids，话题页会报错或无数据。","rootCauseGuess":"TypeScript 类型与文档假定 posts 有 topic_ids 数组；实际 schema 可能仅通过 post_topics 关联。","enhancementSuggestion":"确认 DB 是否有 topic_ids 列或等价视图；若无，改为通过 post_topics 关联查询（如 from('posts').select().in('id', subquery of post_ids from post_topics where topic_id=?) 或 RPC）。","severity":"高"},
  {"contentType":"post","stage":"edit","scenario":"编辑帖子保存后 Feed / 收藏列表展示","affectedModules":["Feed","Favorite"],"observedIssue":"编辑成功后未 invalidate ['feed'] 与 ['favorites', userId]，Feed 与收藏列表可能仍显示旧文案/旧图直到缓存失效或刷新。","rootCauseGuess":"编辑页只失效了 ['posts']、['post', postId]、['userPosts']，未覆盖 Feed 与 favorites 的 queryKey。","enhancementSuggestion":"保存成功后增加 queryClient.invalidateQueries({ queryKey: ['feed'] }) 与 queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })（或按 prefix 批量失效）。","severity":"中"},
  {"contentType":"post","stage":"interact","scenario":"删除评论后帖子 comment_count","affectedModules":["Feed","Profile","Topic","Post Detail"],"observedIssue":"需确认 comments 表删除或状态变更是否有 trigger 更新 posts.comment_count；若未更新则 PostCard/Detail 会与真实评论数不一致。","rootCauseGuess":"计数一致性依赖 DB trigger 或应用层在删评时更新 post。","enhancementSuggestion":"确认 004_update_counts_triggers 或等价迁移中是否包含 comments 删除/更新时对 posts.comment_count 的维护；若无则补充 trigger 或删评 API 内显式更新。","severity":"中"},
  {"contentType":"post","stage":"report","scenario":"同一用户对同一帖子多次举报","affectedModules":["Admin"],"observedIssue":"reports 表未发现 (reporter_id, reported_type, reported_id) 唯一约束，同一用户可对同一帖子提交多份举报，管理员列表可能重复。","rootCauseGuess":"产品未要求防重复举报或未在 DB 层约束。","enhancementSuggestion":"若业务要求一人一帖只保留一条举报：增加唯一约束或 upsert；管理员列表可按 (reported_type, reported_id) 去重展示。","severity":"低"},
  {"contentType":"post","stage":"moderate","scenario":"管理员驳回帖子后，直链与收藏列表行为","affectedModules":["Favorite","Post Detail"],"observedIssue":"驳回后直链 /post/{id} 仍可打开并显示完整内容（仅互动禁用）；收藏列表仍展示该帖且可点进详情，无「已下架」占位或移除。易被理解为「下架后仍能通过某入口访问」，且前台无明确状态提示。","rootCauseGuess":"usePost(postId) 与 FavoriteItem 的 favoriteContent 查询均未过滤 status；产品未要求「下架即不可见」。","enhancementSuggestion":"方案 A：前台展示层统一策略——usePost 或服务端接口对非作者/非管理员只返回 status=approved 的帖子，否则 404 或返回占位「内容已下架」。方案 B：保留直链可读，但在详情页与收藏卡片显式展示「已下架」标识并禁用互动。同时收藏列表可过滤掉非 approved 的帖子或显示占位。","severity":"关键链路"},
  {"contentType":"post","stage":"moderate","scenario":"对已通过帖子的「再次下架」","affectedModules":["Admin","Feed","Topic","Search","Favorite"],"observedIssue":"当前仅支持对 pending 的 reject，无「将已 approved 帖子改为 rejected/hidden」的接口，无法对已上线内容做事后下架。","rootCauseGuess":"content-review reject 仅允许 status===pending 时更新。","enhancementSuggestion":"若需「下架已通过内容」：新增 API（如 PATCH /api/admin/content-review/[id]/take-down）或将 reject 扩展为允许从 approved 改为 rejected/hidden，并通知作者；同时确保 Feed/Topic/Search/直链/收藏行为与「驳回」一致。","severity":"高"},
  {"contentType":"post","stage":"moderate","scenario":"用户删除自己帖子后 Feed 数据源","affectedModules":["Feed"],"observedIssue":"删除后未 invalidate ['feed']。Feed 先 RPC 取 id 列表再按 id 拉帖子；若某 id 已被删，第二次查询拿不到该行，结果列表会少一条，不会出现「幽灵卡片」，但可能短暂出现空位或数量与预期不符。","rootCauseGuess":"删除帖只失效了 posts/post/userPosts，未失效 feed；RPC 不感知行级删除，仍可能返回已删 id。","enhancementSuggestion":"用户删帖成功后 invalidateQueries({ queryKey: ['feed'] })（或 prefix ['feed']），使 Feed 重新拉取 id 列表与帖子，避免使用已删 id。","severity":"中"},
  {"contentType":"post","stage":"moderate","scenario":"驳回后恢复 / 管理员恢复帖子","affectedModules":["Admin","Feed","Topic","Profile","Search"],"observedIssue":"无「rejected → approved」的恢复接口，驳回后无法在现有 API 下恢复为上线状态；若未来有恢复，需同步 invalidate Feed/Topic/Profile/Search 及 ['post', id]。","rootCauseGuess":"content-review approve 仅允许 status===pending。","enhancementSuggestion":"新增恢复 API 或将 approve 扩展为：当 status 为 rejected 时也可更新为 approved，并触发与「审核通过」相同的通知与缓存失效策略。","severity":"中"}
]
```
