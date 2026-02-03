# 帖子审核能力增强方案（内容类型扩展后）

## 一、现状简要

- **审核入口**：`/admin/review`，使用 `ContentReview` 组件；拉取待审帖子为 `posts.status = 'pending'`，`select('*')` 已包含 `post_type`、`music_url`、`video_url`、`cover_url`、`chapter_number` 等扩展字段。
- **展示**：待审帖子卡片**仅展示 `post.content`**，无类型标签、无图片/音乐/视频预览时，审核员无法区分类型并全面判断内容。
- **通过前**：帖子点击「通过」时先调 **`/api/cloudinary/migrate-post-images`**，只处理 **`posts.image_urls`**（图文帖图片），不处理 `music_url`、`video_url`、`cover_url`。
- **通过 API**：`/api/admin/content-review/[id]/approve` 仅更新 `status`、`reviewed_by`、`reviewed_at`，无按 `post_type` 的分支逻辑。
- **通过后**：对所有帖子触发「翻译」「提取话题」；DB 侧已有 trigger 对 story/music/short_video 加分与授章。

结论：**数据已就绪，但审核「展示」与「通过前迁移/校验」未按扩展类型区分，需要增强。**

---

## 二、扩展点与可选策略

### 2.1 展示层（必做）

**目标**：审核员在列表中能一眼看出类型，并能预览该类型的主要内容再决定通过/驳回。

| 扩展项 | 说明 | 建议 |
|--------|------|------|
| 类型标签 | 每条待审帖子显示 `post_type` 文案（图文/故事/音乐/短视频等） | 必做，便于筛选与认知 |
| 内容预览 | 按类型展示可预览内容 | 必做 |
|  | · **story**：展示 `content` 摘要 + 若有 `image_urls` 则首图缩略图；可标 `chapter_number` | 必做 |
|  | · **music**：展示 `content` + `music_url` 可播或链接；可标 `duration_seconds`、`cover_url` 缩略图 | 必做 |
|  | · **short_video**：展示 `content` + `video_url` 可播或链接 + `cover_url` 缩略图；可标 `duration_seconds` | 必做 |
|  | · **image / normal**：维持或增强为 `content` + `image_urls` 缩略图 | 建议（与现有行为一致或略增强） |
| 列表筛选 | 按 `post_type` 筛选待审帖子（如只看「音乐」「短视频」） | 可选，按运营需求 |

**实施要点**：  
- 仍用现有 `select('*')` 即可，前端根据 `post.post_type` 分支渲染不同类型卡片（或共用卡片内不同区域）。  
- 音乐/视频预览：若 URL 为当前域或可信 CDN，可直接 `<audio>`/`<video>`；否则仅显示链接 + 封面图，避免跨域或大文件自动播放问题。

---

### 2.2 通过前「迁移」策略（已决策：扩展至音乐 + 短视频）

**现状**：仅对帖子调用 `migrate-post-images`，只迁移 **`image_urls`**；`music_url`、`video_url`、`cover_url` 不迁移。

**决策**：  
- 图片迁移已完成。  
- **帖子音乐**（若有上传到 Supabase）、**帖子短视频**（若有上传）也需迁移到 CDN，因 Supabase 不适合承载大量音视频流量与存储。  
- 采用 **方案 B（扩展迁移）**：审核通过前，按 `post_type` 一并迁移 `image_urls`、`cover_url`（图片）、`music_url`（音频）、`video_url`（视频）中属于 Supabase 的 URL，统一到 Cloudinary（图用 Image API，音/视频用 Video API）。

可选方案（供参考，已选 B）：

| 方案 | 内容 | 优点 | 缺点 |
|------|------|------|------|
| A. 不扩展迁移 | 保持仅迁移 `image_urls` | 实现简单 | 音视频继续占用 Supabase，不利于扩展 |
| **B. 扩展迁移 API（已选）** | 审核通过前，除 `image_urls` 外，按 `post_type` 迁移：<br>· music：`music_url`（→ Cloudinary Video/音频）、`cover_url`（→ 图片 CDN，若为 Supabase）；<br>· short_video：`video_url`（→ Cloudinary Video）、`cover_url`（→ 图片 CDN，若为 Supabase）；<br>· 所有类型：`image_urls` + 若存在则 `cover_url`（图） | 通过后媒体统一在 CDN，减轻 Supabase 压力 | 需在现有迁移 API 上增加音视频上传与多 bucket 解析 |
| C. 仅迁移封面/图 | 只迁 `image_urls` + `cover_url`（图），不迁音视频 | 折中 | 音视频仍留 Supabase，不符合当前决策 |

**方案 B 落地要点**（实施时参考）：

1. **Supabase 源**  
   - 图片：现有 `posts` bucket（`image_urls`）、以及 `cover_url` 若指向 Supabase 则需识别为 `posts` 或统一图片 bucket。  
   - 音乐：`music` bucket（`music_url`）。  
   - 短视频：`short-videos` bucket（`video_url`）。  
   - 封面：`cover_url` 可能来自 `posts` 或其它桶，按 URL 解析 bucket 与路径。

2. **Cloudinary 目标**  
   - 图片（含封面）：现有 **Image API** `POST /v1_1/{cloud}/image/upload`，folder 如 `posts`、`covers`。  
   - 音频：**Video API** `POST /v1_1/{cloud}/video/upload`（Cloudinary 支持音频格式如 mp3），folder 如 `posts/music`。  
   - 视频：**Video API** `POST /v1_1/{cloud}/video/upload`，folder 如 `posts/short-videos`。

3. **流程**  
   - 一次迁移请求仍按 `postId` 拉取整帖，按 `post_type` 及字段是否存在决定要迁移的 URL 列表。  
   - 先统一「拉取 → 上传 Cloudinary → 收集新 URL 与待删路径」，任一步失败则不改 DB、不删 Supabase。  
   - 全部成功后再更新 `posts` 的 `image_urls`、`cover_url`、`music_url`、`video_url`，并按 bucket 删除 Supabase 中对应对象。

4. **URL 判定**  
   - 仅当 URL 为 Supabase 对应 bucket 的公开链接时才迁移；已是 Cloudinary 或其它 CDN 的 URL 保留不动。

---

### 2.3 通过前「校验」策略（可选）

**目标**：在点击「通过」时，对部分类型做一致性或合规校验，避免明显错误内容进入已审状态。

| 校验项 | 适用类型 | 说明 | 建议 |
|--------|----------|------|------|
| 媒体 URL 可访问性 | music / short_video | 审核通过前 HEAD/GET 检查 `music_url` / `video_url` 是否可访问；不可访问则提示或禁止通过 | 可选，按运营需求 |
| 故事/连载必填 | story / series | 若有业务规则「故事必须有 content 或章节号」等，可在 API 层做 | 可选 |

**实施层级**：  
- 可在 **前端**（ContentReview）点击「通过」前做部分校验，失败则 toast 并阻止请求。  
- 更稳妥的做法是在 **`/api/admin/content-review/[id]/approve`** 内对帖子做一次校验后再更新状态。

---

### 2.4 通过后「AI / 下游」策略（可选）

**现状**：审核通过后对所有帖子触发「翻译」「提取话题」。

| 下游 | 说明 | 建议 |
|------|------|------|
| 翻译 | 若当前实现是「按 content 翻译」，则 music/short_video 可能仅有标题/简介，可照常翻译；纯音乐/视频无正文时可跳过或只翻标题 | 按现有实现，必要时对 `post_type` 做分支：仅对有正文的类型调翻译 |
| 提取话题 | 通常基于文本；对 music/short_video 可沿用现有逻辑（有 content 就提取），无则跳过 | 可选：仅对 story/text/image/normal 等有主文案的类型调用 extract-topics |

**实施**：在调用 `translate-after-publish` / `extract-topics-after-approval` 的**调用方**（ContentReview 或 approve API）根据 `post_type` 决定是否触发，或在 API 内部先查帖子类型再决定是否执行，避免无效调用。

---

## 三、推荐实施顺序（不写代码，仅顺序）

1. **展示层增强（必做）**  
   - 在 ContentReview 的待审帖子卡片中：展示 `post_type` 标签；按 `post_type` 分支展示内容预览（故事摘要+图、音乐链接+封面、短视频链接+封面、图文则现有或略增强）。  
   - 可选：列表顶部增加按 `post_type` 筛选。

2. **迁移策略（已选 B：扩展至音乐 + 短视频）**  
   - 在现有迁移流程上扩展：除 `image_urls` 外，支持 `cover_url`（图）、`music_url`（Supabase music bucket → Cloudinary Video）、`video_url`（Supabase short-videos bucket → Cloudinary Video）。  
   - 审核通过前按帖一次迁移所有 Supabase 媒体，全部成功后再更新 DB 并删除 Supabase 对象。

3. **通过后 AI（可选）**  
   - 按 `post_type` 决定是否调用翻译/提取话题，减少对无正文类型的无效调用。

---

## 四、小结

- **必须增强**：审核列表的**展示**要按扩展的 `post_type` 显示类型与对应预览（文案+图片/音乐/视频），否则无法正确审核新类型。
- **已选**：媒体迁移采用 **B（全量迁）**：图片 + 封面 + 音乐 + 短视频，均从 Supabase 迁至 Cloudinary，减轻 Supabase 压力。
- **说明**：帖子无付费章节功能，创作者收入仅通过打赏；审核无需校验付费章节或作者开通状态。  
- **按需选择**：媒体 URL 可访问性校验、通过后 AI 的按类型分支。

按上述顺序实施后，帖子审核功能即可在内容类型扩展后继续正确、可控地处理各类帖子。
