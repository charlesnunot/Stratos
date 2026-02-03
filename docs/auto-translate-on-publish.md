# 仅中英双语 + 发布时自动翻译

## 目标

- 项目**国际化仅支持中文与英文**（见 `src/i18n/config.ts`，已移除 es/pt/ja/ar）。
- 用户发布帖子、评论、商品时，**自动翻译**到另一种语言并落库。
- 前端按当前 locale 直接展示对应语言，**不再需要「翻译」按钮**，体验更简单。

## 数据设计

### 通用规则

- 用户输入存为「原文」；AI 翻译结果存为「译文」。
- 用 `content_lang` 标记原文语言：`'zh'` | `'en'`。
- 展示时：`locale === content_lang` 用原文，否则用译文；若译文为空（老数据或翻译失败）则回退到原文。

### 表结构变更

| 表 | 新增字段 | 说明 |
|----|----------|------|
| **posts** | `content_lang TEXT`, `content_translated TEXT` | 原文语言 + 另一种语言的译文 |
| **comments** | `content_lang TEXT`, `content_translated TEXT` | 同上 |
| **products** | `content_lang TEXT`, `name_translated TEXT`, `description_translated TEXT` | 商品名、描述各存译文 |

- 已有数据：`content_lang` 可默认 `'zh'` 或由脚本检测；`*_translated` 可为 NULL，展示时回退原文。
- 新数据：发布时根据当前 locale 设 `content_lang`，调用 AI 得到译文写入 `*_translated`。

## 流程

1. **发布帖子/评论/商品**（create/update）
   - 写入原文到 `content` / `name`+`description`，并设 `content_lang`（来自当前 locale）。
   - 调用 AI 翻译到另一种语言，结果写入 `content_translated` / `name_translated` + `description_translated`（可异步或同请求内更新）。
2. **展示**
   - 所有读帖子/评论/商品的地方：按 `locale` 与 `content_lang` 选择显示 `content` 或 `content_translated`（及商品的 name/description 对应字段），无译文时用原文。
3. **前端**
   - 移除帖子卡片、商品卡片、评论、详情页等处的「翻译」按钮和翻译弹层。

## 实现要点

- **服务端翻译**：在 create/update 的 API 或 Server Action 中调用现有 `/api/ai/complete`（translate_post / translate_comment / translate_product），或用共享的 DeepSeek 调用，避免重复逻辑。
- **未配置 AI**：若未配置 `DEEPSEEK_API_KEY`，`*_translated` 保持 NULL，前端仍只显示原文，行为与现在一致。
- **限流**：发布时自动翻译不占用「聊天翻译 10 条/天」配额（仅 translate_message 限频）。
