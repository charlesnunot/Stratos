# 搜索与话题功能 — 审计报告

**审计范围**：搜索、话题浏览与推荐、权限与数据一致性、性能与异常处理  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议；已修复项已落地。

---

## 1. 搜索功能

**页面与接口**：`/main/search`（客户端 Supabase 查询）、`/api/products/categories`（分类列表）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 搜索结果准确，排序合理 | **通过**：帖子按 content ilike、商品按 name/description ilike、用户按 username/display_name ilike；均 limit(10)；排序依赖默认。 | 通过 | 无。 |
| 用户只能看到有权限访问的数据 | **通过**：使用 Supabase 客户端，RLS 生效；帖子仅 status=approved，商品仅 status=active；profiles 表 RLS 允许所有人 SELECT，但已改为仅返回展示所需列。 | 通过 | 已修复：用户搜索结果仅 select id, username, display_name, avatar_url。 |
| 搜索输入是否有防注入或异常字符处理 | **已修复**：原将 `query` 直接拼入 ilike，`%`/`_` 可改变匹配语义，且无长度限制。已增加 `sanitizeSearchQuery`：trim、最大 100 字、`escapeForLike` 转义 `%`/`_`，搜索前使用安全字符串。 | ~~中~~ 已修复 | 无。 |

### 1.2 已实施修复（搜索）

- **`src/lib/utils/search.ts`**（新建）：`escapeForLike`、`sanitizeSearchQuery`（trim、截断 100 字、转义 LIKE 通配符）。
- **`src/app/[locale]/(main)/search/page.tsx`**：搜索前使用 `sanitizeSearchQuery(query)`，仅当非空时发起请求；用户查询改为 `.select('id, username, display_name, avatar_url')`。

---

## 2. 话题浏览与推荐

**页面与接口**：`/main/topics/[topic]`。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 话题列表显示正确帖子和用户 | **已修复**：原用 `usePosts('approved')` 拉全量分页再客户端按 topic 过滤，导致话题页只显示“前几页里恰好属于该话题”的帖子，数据不完整。已改为按话题 ID 分页拉取：`useTopicPosts(topicId)` 查询 `posts.contains('topic_ids', [topicId])`，与首页/信息流一致。 | ~~中~~ 已修复 | 无。 |
| 内容过滤是否正确（违规、敏感屏蔽） | **通过**：仅拉取 status=approved 的帖子；话题表 RLS 允许所有人 SELECT；无额外敏感内容过滤逻辑，与现有策略一致。 | 通过 | 无。 |
| 数据一致性：帖子在话题、首页、信息流显示同步 | **通过**：话题页现基于 topic_ids 与 status=approved 查询，与帖子列表/信息流数据源一致；分页、加载更多已支持。 | 通过 | 无。 |

### 2.2 已实施修复（话题）

- **`src/lib/hooks/usePosts.ts`**：新增 `fetchTopicPosts(topicId, page)`、`useTopicPosts(topicId)`，按 `topic_ids` 包含 topicId 且 status=approved 分页拉取。
- **`src/app/[locale]/(main)/topics/[topic]/page.tsx`**：使用 `validateTopicParam(decodeTopicParam(raw))` 校验话题参数（长度≤100、去除控制字符）；使用 `useTopicPosts(topic?.id)` 替代 `usePosts`+ 客户端过滤；增加「加载更多」按钮（hasNextPage / fetchNextPage）。

---

## 3. 性能与稳定性

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 搜索和话题接口是否响应稳定 | **通过**：搜索为客户端 Supabase 直连，话题页为客户端查询 + 分页；categories 为服务端单次查询；无超时或重试逻辑，依赖 Supabase 默认。 | 通过 | 可选：搜索改为服务端 API 并加限流与超时。 |
| 分页、加载更多、筛选功能是否正常 | **通过**：话题页已支持分页与「加载更多」；搜索无分页（limit 10）；categories 无分页。 | 通过 | 无。 |
| 高并发访问下是否有性能瓶颈 | **低**：搜索/话题均为客户端直连 DB，高并发由 Supabase 与 RLS 承担；categories 可加短期缓存。 | 低 | 可选：categories 响应加 Cache-Control 或短期缓存。 |

---

## 4. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 搜索错误或接口异常是否记录日志 | **部分**：搜索在客户端执行，错误仅 `console.error('Search error:', error)`，无服务端日志。categories 出错时原未写日志。 | 低 | 已修复：categories 失败时 `console.error('[api/products/categories]', error.message)`。搜索若改为服务端 API 可一并记录。 |
| 日志中敏感信息是否受保护 | **通过**：categories 仅记录 error.message，不记录请求体；搜索无服务端日志。 | 通过 | 无。 |

### 4.1 已实施修复（日志）

- **`src/app/api/products/categories/route.ts`**：在返回 500 前增加 `console.error('[api/products/categories]', error.message)`。

---

## 5. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 状态 |
|------|--------|----------|----------|------|
| 1 | 搜索关键词未转义/无长度限制 | 用户输入含 %/_ 改变 LIKE 语义，长串增加负载 | ~~中~~ | **已修复**：sanitizeSearchQuery + 100 字限制 |
| 2 | 用户搜索结果返回 select * | 暴露 role、status 等非展示字段 | 低 | **已修复**：仅返回 id, username, display_name, avatar_url |
| 3 | 话题页帖子数据不完整 | 用全量帖子+客户端过滤，话题下帖子不全 | ~~中~~ | **已修复**：useTopicPosts 按 topic_ids 分页拉取 |
| 4 | 话题 URL 参数未校验 | 超长或控制字符可能影响查询/展示 | 低 | **已修复**：validateTopicParam 长度+去控制字符 |
| 5 | categories 失败无日志 | 排查困难 | 低 | **已修复**：console.error 记录错误 |

---

## 6. 可选后续优化

- 搜索改为服务端 API（如 `/api/search`）：统一限流、超时、错误日志与敏感信息保护。
- categories 响应加短期缓存（如 Cache-Control 或内存/Redis）以减轻高并发压力。
- 话题页「暂无帖子」与「加载更多」等文案做 i18n。
