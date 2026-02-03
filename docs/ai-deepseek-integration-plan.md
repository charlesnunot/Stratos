# DeepSeek 集成详细实施计划（6 场景版）

基于项目实际代码结构制定的分阶段实施计划，遵循「快、好、省」原则。

---

## 一、现状与依赖

| 项目 | 路径/说明 |
|------|-----------|
| AI 接口 | [`src/app/api/ai/complete/route.ts`](src/app/api/ai/complete/route.ts)：仅支持 `{ input }`，无 task/max_tokens |
| 帖子创建 | [`src/app/[locale]/(main)/post/create/page.tsx`](src/app/[locale]/(main)/post/create/page.tsx)：`content` + `topics`（手动输入），提交时写 `post_topics` |
| 帖子编辑 | [`src/app/[locale]/(main)/post/[id]/edit/page.tsx`](src/app/[locale]/(main)/post/[id]/edit/page.tsx)：占位页（「编辑功能即将上线」），**A 仅做发帖页** |
| 帖子详情 | [`src/app/[locale]/(main)/post/[id]/page.tsx`](src/app/[locale]/(main)/post/[id]/page.tsx)：`post.content` 约 269–275 行渲染 |
| 评论 | [`src/components/social/CommentSection.tsx`](src/components/social/CommentSection.tsx)：`CommentItem` 内 `comment.content` 约 1240 行，操作区约 1256–1284 行（点赞/回复/举报） |
| 商品详情 | [`src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`](src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx)：`product.name` 约 346 行，`product.description` 约 398–402 行 |
| 商品创建/编辑 | [`src/app/[locale]/(main)/seller/products/create/page.tsx`](src/app/[locale]/(main)/seller/products/create/page.tsx)、[`edit/page.tsx`](src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx)：`formData.category` 单行输入，约 415–426 行（create）、421–426 行（edit） |
| 聊天 | [`src/app/[locale]/(main)/messages/[id]/ChatPageClient.tsx`](src/app/[locale]/(main)/messages/[id]/ChatPageClient.tsx) → [`ChatWindow`](src/components/chat/ChatWindow.tsx) → [`MessageBubble`](src/components/chat/MessageBubble.tsx)：`message.content` 展示，需限频 10 条/人/天 |
| 帖子卡片更多菜单 | [`src/components/social/PostCard.tsx`](src/components/social/PostCard.tsx)：约 414–517 行，举报 / 打开帖子 / 分享 / 转发 等 | 在更多菜单中增加「翻译成 XX」 |
| 商品卡片更多菜单 | [`src/components/ecommerce/ProductCard.tsx`](src/components/ecommerce/ProductCard.tsx)：约 419–456 行，举报 / 打开商品 / 复制链接 等 | 在更多菜单中增加「翻译成 XX」 |

---

## 二、阶段 0：后端基础（必做）

### 2.1 新建 Prompt 配置

- **文件**：`src/lib/ai/prompts.ts`
- **内容**：按 task 导出 system/user 模板；翻译类模板含占位符 `{target_language}`，由路由注入。
- **Task 列表**：`extract_topics`、`translate_comment`、`translate_post`、`translate_product`、`suggest_category`、`translate_message`。
- **extract_topics**：要求模型返回「逗号或换行分隔的关键词」或「JSON 数组」，便于后端解析为 `string[]`。

### 2.2 扩展 `/api/ai/complete`

- **文件**：[`src/app/api/ai/complete/route.ts`](src/app/api/ai/complete/route.ts)
- **请求体**：`input`（必填）、`task`（可选）、`target_language`（翻译类必填）、`max_tokens`（可选，默认 1024，上限 2048）。
- **逻辑**：
  - `input` 长度上限 2000 字符，超则 400。
  - 有 `task` 时从 `prompts.ts` 取模板，拼好 messages（含 `target_language`），再调 DeepSeek；无 `task` 时保持现有行为（整段 input 作 user 消息）。
  - 请求 DeepSeek 时传 `max_tokens`，可选 `temperature: 0.3`。
- **响应**：
  - 默认 `{ result: string }`。
  - `task === 'extract_topics'` 时：将模型返回解析为 `string[]`（按逗号/换行/JSON），返回 `{ topics: string[] }`。
- **兼容**：不传 `task` 时行为与当前一致。

### 2.3 聊天翻译限频（F 专用）

- **存储**：Supabase 新表 `ai_translation_daily_usage`（`user_id` uuid、`usage_date` date、`task` text 默认 `'translate_message'`、`count` int 默认 0，唯一约束 `(user_id, usage_date)`），或单列 `count` 按日更新。
- **迁移**：`supabase/migrations/166_ai_translation_daily_usage.sql`。
- **API 逻辑**：当 `task === 'translate_message'` 时，从请求头或 body 取当前用户 id（需已登录），查/增当日计数，若 `count >= 10` 返回 429 与提示；否则执行翻译并 `count+1`。
- **鉴权**：翻译接口需能识别用户（session 或 body 传 `user_id` 由服务端校验），未登录直接 401。

---

## 三、阶段 1：前端封装与 i18n

### 3.1 调用封装

- **文件**：`src/lib/ai/useAiTask.ts`
- **接口**：`useAiTask()` 返回 `{ runTask, loading, error }`；`runTask({ task, input, targetLanguage? })` 返回 `Promise<{ result?: string; topics?: string[] }>`。
- **实现**：`POST /api/ai/complete`，body `{ input, task, target_language, max_tokens }`，超时 3–5s；解析 `topics` 或 `result`；失败时抛错或返回空，由调用方决定是否回退原文。
- **可选**：同页面内对 `(task, input, target_language)` 做短期缓存（如 60s），避免重复点击浪费。

### 3.2 i18n

- **文件**：`src/messages/zh.json`、`src/messages/en.json`（及其他 locale）
- **新增键示例**：`ai.extractTopics`、`ai.suggestCategory`、`ai.translate`、`ai.translateTo`、`ai.translationLimitReached`、`ai.loading`、`ai.failed`；`posts.topic` 等已有可复用。

---

## 四、阶段 2：场景 A（帖子自动提取话题）

### 4.1 页面与交互

- **文件**：[`src/app/[locale]/(main)/post/create/page.tsx`](src/app/[locale]/(main)/post/create/page.tsx)
- **位置**：Topics 卡片内，在「创建」按钮旁或标签上方增加「提取话题」按钮。
- **逻辑**：`content` 为空时按钮禁用或 toast 提示先输入正文。点击后调用 `runTask({ task: 'extract_topics', input: content })`，返回 `topics` 后与当前 `topics` 合并去重（或替换，产品定），更新 `topics` state，用户可删减再提交。
- **注意**：帖子编辑页当前为占位，A 仅做发帖页；日后编辑页上线后再在此处加同样按钮。

---

## 五、阶段 3：场景 E（产品自动分类）

### 5.1 商品创建页

- **文件**：[`src/app/[locale]/(main)/seller/products/create/page.tsx`](src/app/[locale]/(main)/seller/products/create/page.tsx)
- **位置**：分类输入框旁（约 415–426 行），增加「建议分类」按钮。
- **逻辑**：将 `formData.name` + `formData.description` 拼成一段文本作为 `input`，`runTask({ task: 'suggest_category', input })`，将返回的 `result` 写入 `formData.category`，用户可修改。

### 5.2 商品编辑页

- **文件**：[`src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx`](src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx)
- **位置**：分类输入框旁（约 421–426 行），同样增加「建议分类」按钮，逻辑同创建页。

---

## 六、卡片更多菜单中的翻译（帖子卡片 / 商品卡片）

### 6.1 需求与节约原则

在帖子卡片、商品卡片的「更多」菜单中增加「翻译成 XX」按钮；**为节约调用与避免无效点击，仅当「内容语言 ≠ 用户当前选择的国际化语言（locale）」时才显示该按钮**。内容已是用户所选语言时不显示翻译入口。

### 6.2 显示规则（节约优先）

- **原则**：仅当「内容语言 ≠ locale」时显示「翻译成 [与当前 locale 对应的另一门语言]」，否则不显示。这样可减少无效点击和 API 调用。
- **实现方式二选一（或分阶段）**：
  1. **方案 A：存储内容语言**  
     - 在帖子、商品上增加可选字段 `content_lang`（如 `zh` / `en`），发帖/创建或编辑商品时由作者或卖家选择（或默认站点主语言）。  
     - 卡片/详情页根据 `content_lang !== locale` 决定是否显示「翻译成 XX」。  
     - 需要：DB 迁移（posts、products 表增加 `content_lang`）、发帖页/商品创建与编辑页的表单项、列表与详情查询带上该字段。
  2. **方案 B：客户端轻量检测**  
     - 不新增 DB 字段，在渲染卡片时对 `post.content` / `product.name` + `product.description` 做轻量语言检测（如基于字符集/常用词等启发式，或使用体积较小的检测库）。  
     - 仅当检测结果与当前 `locale` 不一致时显示「翻译成 XX」。  
     - 优点：无需改表与表单；缺点：检测可能偶有误判，可接受少量「该显示未显示」或「不该显示却显示」。
- **建议**：若希望长期节约且体验稳定，优先采用方案 A（存 `content_lang`）；若希望先快速上线再优化，可先用方案 B，后续再接入方案 A 并以后者为准。

### 6.3 帖子卡片（PostCard）

- **文件**：[`src/components/social/PostCard.tsx`](src/components/social/PostCard.tsx)
- **位置**：更多菜单内（约 414–517 行），在「打开帖子」「分享到」等项之间或之后增加「翻译成 XX」。
- **显示条件**：仅当「内容语言 ≠ locale」时渲染该菜单项（内容语言来自 `post.content_lang`（方案 A）或对 `post.content` 的轻量检测（方案 B）；无 content 时不显示或禁用）。
- **逻辑**：根据当前 `locale` 决定目标语言（如 zh → English，en → 中文）；点击后取 `post.content` 调用 `runTask({ task: 'translate_post', input: post.content, target_language })`，将译文在弹层（Dialog/Popover）中展示。
- **缓存**：同 `post.id` + `target_language` 可短期缓存，避免重复请求。

### 6.4 商品卡片（ProductCard）

- **文件**：[`src/components/ecommerce/ProductCard.tsx`](src/components/ecommerce/ProductCard.tsx)
- **位置**：更多菜单内（约 419–456 行），在「打开商品」「复制链接」等项之间或之后增加「翻译成 XX」。
- **显示条件**：仅当「内容语言 ≠ locale」时渲染该菜单项（内容语言来自 `product.content_lang`（方案 A）或对 `product.name` + `product.description` 的轻量检测（方案 B））。
- **逻辑**：目标语言由 `locale` 推导；点击后取 `product.name` + `product.description`（或仅 description 若 name 很短）作为 `input`，调用 `runTask({ task: 'translate_product', input, target_language })`，译文在弹层中展示。
- **缓存**：同 `product.id` + `target_language` 可短期缓存。

### 6.5 实施顺序

可与「阶段 5（帖子正文翻译）」和「阶段 6（产品翻译）」一起做，或紧接其后；依赖阶段 0（后端）与阶段 1（useAiTask + i18n）。

---

## 七、阶段 4：场景 B（评论翻译）

### 6.1 CommentSection / CommentItem

- **文件**：[`src/components/social/CommentSection.tsx`](src/components/social/CommentSection.tsx)
- **位置**：`CommentItem` 内操作区（约 1256–1284 行），在「回复」「举报」旁增加「翻译」按钮（或下拉菜单项）。
- **逻辑**：
  - 点击后弹出目标语言选择（或直接用当前 locale 的对立语言，如当前 zh 则翻 en），再调用 `runTask({ task: 'translate_comment', input: comment.content, target_language })`。
  - 展示：可在原评论下方折叠展示「翻译结果」，或替换当前展示内容并加「显示原文」切换；建议折叠展示，避免改结构过大。
- **缓存**：同一 `comment.id` + `target_language` 可短期缓存，避免重复请求。

---

## 八、阶段 5：场景 C（帖子正文翻译）

### 7.1 帖子详情页

- **文件**：[`src/app/[locale]/(main)/post/[id]/page.tsx`](src/app/[locale]/(main)/post/[id]/page.tsx)
- **位置**：正文区块（约 269–275 行）旁或下方增加「翻译成 XX」按钮（XX 由当前 locale 决定对立语言或下拉选择）。
- **逻辑**：`runTask({ task: 'translate_post', input: post.content, target_language })`，结果在正文下方折叠展示或替换展示 +「显示原文」。
- **缓存**：同 `postId` + `target_language` 可短期缓存。

---

## 九、阶段 6：场景 D（产品翻译）

### 8.1 商品详情页

- **文件**：[`src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`](src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx)
- **位置**：标题旁（约 346 行）与描述区块旁（约 398–402 行）增加「翻译成 XX」按钮。
- **逻辑**：分别对 `product.name` 与 `product.description`（或整段 name+description 一次请求）调用 `runTask({ task: 'translate_product', input, target_language })`，结果展示在对应位置下方或替换展示 +「显示原文」。
- **缓存**：同 `productId` + `target_language` + 字段名可缓存。

---

## 十、阶段 7：场景 F（聊天翻译 + 限频）

### 9.1 限频与鉴权（阶段 0 已列）

- 表 `ai_translation_daily_usage` 与 `/api/ai/complete` 内对 `translate_message` 的检查见 2.3。
- 前端需传当前用户 id（或由服务端从 session 读），否则 401。

### 9.2 MessageBubble

- **文件**：[`src/components/chat/MessageBubble.tsx`](src/components/chat/MessageBubble.tsx)
- **位置**：每条消息操作区（如更多菜单内）增加「翻译」；若为卡片类消息可不对 content 翻译或仅对文案翻译。
- **逻辑**：
  - 先请求一次「今日已用次数」接口（可选，或直接调翻译接口由 429 得知超限）。
  - 调用 `runTask({ task: 'translate_message', input: message.content, target_language })`；若 429 则 toast「今日翻译已达 10 条」并隐藏/禁用该条翻译按钮。
  - 展示：同评论，折叠显示翻译结果或切换原文/译文。
- **限制**：仅对当前用户「收到的消息」或「发出的消息」提供翻译，且同一会话内前 10 条/天可点翻译，超限后该会话内翻译按钮隐藏或禁用（由全局今日次数控制）。

---

## 十一、实施顺序汇总

| 阶段 | 内容 | 产出 |
|------|------|------|
| 0 | 后端基础 | `prompts.ts`、扩展 `route.ts`、迁移 166、F 限频逻辑 |
| 1 | 前端封装与 i18n | `useAiTask.ts`、各 locale 新增键 |
| 2 | A 帖子提取话题 | post create 页「提取话题」按钮 + 合并 topics |
| 3 | E 产品自动分类 | seller products create/edit「建议分类」按钮 |
| 4 | B 评论翻译 | CommentSection CommentItem「翻译」+ 展示 |
| 5 | C 帖子正文翻译 | post [id] 页「翻译成 XX」+ 展示 |
| 6 | D 产品翻译 | ProductPageClient 标题/描述「翻译成 XX」+ 展示 |
| 6b | 卡片更多菜单翻译 | PostCard / ProductCard 更多菜单中「翻译成 XX」+ 弹层展示译文；**仅当内容语言 ≠ locale 时显示**（方案 A：posts/products 增加 content_lang 并表单选择；方案 B：客户端轻量语言检测） |
| 7 | F 聊天翻译 | MessageBubble「翻译」+ 10 条/天限频与展示 |

---

## 十二、验收要点

- **A**：发帖页输入正文后点「提取话题」，出现建议标签并可编辑后提交。
- **E**：商品 create/edit 点「建议分类」，分类框填入建议值并可改。
- **B/C/D**：对应位置点「翻译」选语言后，出现译文且可回退原文；刷新后缓存可失效。
- **F**：聊天消息点「翻译」正常显示；同一用户当日第 11 次请求返回 429，前端提示并禁用/隐藏翻译入口。
- **卡片更多菜单**：仅当内容语言 ≠ 当前 locale 时，帖子/商品卡片更多菜单中才显示「翻译成 XX」；点击后弹层展示译文；内容语言由方案 A（content_lang）或方案 B（轻量检测）得到。

---

## 十三、成本与稳定性

- 所有调用均为用户点击触发，超时 3–5s，无自动轮询。
- `max_tokens` 默认 1024，输入截断 2000 字符。
- 翻译类按需调用，B/C/D 可做短期前端缓存；F 严格 10 条/人/天，后端表计数。
- **卡片/详情翻译入口**：仅当「内容语言 ≠ 用户 locale」时显示翻译按钮（方案 A 存 `content_lang` 或方案 B 轻量检测），减少无效点击与 API 调用。
