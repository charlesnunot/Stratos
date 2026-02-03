# post_type 扩展后：帖子卡片与详情页支持情况分析

## 一、扩展后的 post_type 与字段（来自 225_post_type_extended.sql）

| post_type     | 说明         | 扩展字段 |
|---------------|--------------|----------|
| normal        | 图文（兼容） | —        |
| text          | 纯文         | —        |
| image         | 图片         | —        |
| story         | 故事/连载章  | chapter_number, content_length |
| series        | 连载（同故事）| chapter_number, content_length |
| music         | 音乐         | music_url, duration_seconds, **cover_url** |
| short_video   | 短视频       | video_url, duration_seconds, cover_url |
| affiliate     | 带货         | 关联商品等 |

---

## 二、帖子卡片（PostCardView）现状

### 2.1 已按类型区分的展示

- **short_video**：顶部 9:16 视频区，`video_url` + `cover_url` 作为 poster，下方正文/话题/互动。✓
- **music**：顶部区域为「封面图 + 音频控件」；封面来源为 **imageUrls[0]**，无图时显示 ♪。✓（见下缺口）
- **story**：顶部为摘要区（line-clamp-3 正文 + Ch.x / 字数 +「阅读更多」），无大图；下方话题/互动。✓
- **其他（normal / text / image / series / affiliate）**：顶部为 **imageUrls[0]**（若有），下方正文 + 话题 + 关联商品（若有）+ 互动。✓

### 2.2 数据层（ListPostDTO / mapRowToPost）

- `story_info`、`music_info`、`video_info` 由 `shared.ts` 的 `mapRowToPost` 从 DB 行映射。
- **video_info** 已包含 `cover_url`。
- **music_info** 当前只有 `music_url`、`duration_seconds`，**未包含 `cover_url`**，列表 DTO 因此也没有音乐的封面字段。

### 2.3 卡片层缺口与建议

| 缺口 | 说明 | 建议 |
|------|------|------|
| **音乐封面** | 卡片用 `imageUrls[0]` 当音乐封面；若作者只填了 `cover_url` 未填 `image_urls`，则只显示 ♪。 | 在 `mapRowToPost` 中为 music 类型填充 `music_info.cover_url`（来自 posts.cover_url），并在 ListPostContentDTO 的 musicInfo 中增加 `cover_url`；卡片优先用 `musicInfo.cover_url`，无则用 `imageUrls[0]`。 |
| **series 与 story 不一致** | 卡片仅对 `postType === 'story'` 走「摘要 + Ch.x + 字数 + 阅读更多」；**series** 走的是「首图 + 正文」的通用分支，没有章节号/字数。 | 卡片对 **series** 与 story 一视同仁：条件改为 `postType === 'story' \|\| postType === 'series'`，同样展示摘要 + 章节号/字数 + 阅读更多。 |

---

## 三、帖子详情页（post/[id]/page.tsx）现状

### 3.1 已按类型区分的媒体区（左侧）

- **short_video**：`videoInfo.video_url` + poster 用 `videoInfo.cover_url || images[0]`。✓
- **music**：`musicInfo.music_url` + 封面用 **images[0]**（即 image_urls[0]），无则 ♪。✓（同上，缺 cover_url）
- **story 且无图**：占位「暂无图片」。✓
- **有图（含 story/series 带图、normal/image 等）**：多图轮播。✓
- **无图且非 story**：占位「暂无图片」。✓

### 3.2 详情页缺口与建议

| 缺口 | 说明 | 建议 |
|------|------|------|
| **音乐封面** | 详情页音乐区封面只用 `images[0]`；若仅有 `cover_url` 无 `image_urls`，封面缺失。 | 与卡片一致：`mapRowToPost` 为 music 写入 `music_info.cover_url`，详情页音乐区优先用 `musicInfo.cover_url`，无则用 `images[0]`。 |
| **story/series 元信息未展示** | 详情页右侧有正文、话题、互动等，但未单独展示「章节号」「字数」等 story_info。 | 可选增强：当 `postType === 'story' \|\| postType === 'series'` 且存在 `chapter_number` 或 `content_length` 时，在正文上方或标题旁展示「Ch.x · x字」。 |

---

## 四、小结

- **已满足**：short_video、story、normal/text/image、affiliate 在卡片和详情页都有对应展示；数据层对 story/music/short_video 的映射整体完整，仅 music 少 `cover_url`。
- **建议必做**：  
  1. **音乐 cover_url**：在 `mapRowToPost` 与 ListPostDTO 的 musicInfo 中增加 `cover_url`，卡片与详情页优先用该字段作音乐封面。  
  2. **series 与 story 统一**：卡片中把 series 与 story 同一分支处理，展示摘要 + 章节号/字数 + 阅读更多。
- **可选增强**：详情页在 story/series 时展示章节号与字数。

按上述补齐后，帖子卡片与详情页即可完整支持当前扩展的 post_type，且不会误导（如音乐只有 cover 无图时仍能正常显示封面）。
