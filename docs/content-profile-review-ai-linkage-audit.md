# 内容与资料审核 + AI 处理链路审计报告

**任务名称**: Content & Profile Review + AI Processing Linkage Test  
**执行日期**: 2026-01-31

---

## 一、审计范围

验证管理员对内容（帖子/商品/评论/用户资料）的审核流程，从审核动作 → AI 翻译/话题抽取 → 数据更新 → 通知与日志的完整端到端链路。

### 检查覆盖

1. **管理员端页面**
   - ContentReview 列表 `/admin/review`
   - ProfileReview 列表 `/admin/profile-review`

2. **API 路由**
   - `/api/admin/content-review/[id]/approve`（新增）
   - `/api/admin/content-review/[id]/reject`（新增）
   - `/api/admin/profiles/[id]/approve-profile`
   - `/api/admin/profiles/[id]/reject-profile`
   - `/api/ai/translate-after-publish`
   - `/api/ai/extract-topics-after-approval`
   - `/api/ai/translate-profile-after-approval`

3. **数据库触发器**
   - 帖子审核通知（post approved/rejected）
   - 商品审核通知（product approved/rejected）
   - 评论审核通知（comment approval）
   - 帖子审核通过后粉丝通知

---

## 二、发现问题及修复

### 问题 1: 缺少内容审核 API 及 logAudit

**现状**: ContentReview 组件直接使用 Supabase 客户端更新 posts/products/comments 表，无 API 封装，无法记录审计日志。

**修复**:
- 新增 `/api/admin/content-review/[id]/approve` API
- 新增 `/api/admin/content-review/[id]/reject` API
- 两个 API 均校验 admin/support 权限
- 均写入 `logAudit`，action 为 `approve_content` 或 `reject_content`
- ContentReview 组件改为调用上述 API 替代直接 Supabase 更新

**API 参数**:
- 路径参数: `id`（帖子/商品/评论 ID）
- 请求体: `{ type: 'post' | 'product' | 'comment' }`

---

### 问题 2: Profile 审核通过无通知

**现状**: `approve-profile` API 仅更新数据库并记录 logAudit，未向用户发送审核通过通知。

**修复**:
- 在 `approve-profile` API 成功更新后，向 `notifications` 表插入一条通知
- `content_key`: `profile_approved`
- 通知目标: `profileId`（被审核用户）

---

### 问题 3: logAudit action 命名不统一

**现状**:
- profile approve/reject 使用 `action: 'profile_review'` + `meta.op`
- 任务要求: `approve_profile`、`reject_profile`

**修复**:
- `approve-profile` API: `action: 'approve_profile'`
- `reject-profile` API: `action: 'reject_profile'`
- 移除 `meta.op`，简化 meta 结构

---

### 问题 4: AI API 未写入 logAudit

**现状**: `translate-after-publish`、`extract-topics-after-approval`、`translate-profile-after-approval` 均未调用 `logAudit`。

**修复**:
- `translate-after-publish`: 帖子/评论/商品翻译成功后写入 `logAudit`，action 分别为 `ai_translate_post`、`ai_translate_comment`、`ai_translate_product`
- `extract-topics-after-approval`: 话题抽取成功后写入 `logAudit`，action: `ai_extract_topics`，meta: `{ topicsAdded }`
- `translate-profile-after-approval`: 资料翻译成功后写入 `logAudit`，action: `ai_translate_profile`

---

### 问题 5: ContentReview 与 ProfileReviewClient 硬编码中文

**现状**: 审核相关页面大量硬编码中文文案。

**修复**:
- ContentReview: 迁移失败、审核失败、成功提示、按钮文案等改用 `t()` / `tCommon()` 翻译
- ProfileReviewClient: 迁移失败、审核失败、空状态、按钮文案改用 `t()` 翻译
- admin/review 页面: 标题、统计卡片、返回链接改用 `t()` 翻译
- 新增 admin 命名空间翻译键: `migrateImagesFailed`、`migrateCommentImagesFailed`、`migrateProductImagesFailed`、`contentReviewed`、`post`、`product`、`comment`、`noContentReviewPermission`、`backToHome`、`postId`、`commentId`、`migrateAvatarFailed`、`noPendingProfiles`、`backToDashboard`、`viewProfile`

---

## 三、验证结果

### 验证点 1: 管理员权限校验正确 ✅

- content-review approve/reject: 校验 `profile.role === 'admin' || 'support'`
- profile approve/reject: 同上
- AI API: `translate-after-publish` 允许内容拥有者或 admin/support；`extract-topics-after-approval`、`translate-profile-after-approval` 仅 admin/support

### 验证点 2: 帖子/资料状态正确流转 ✅

| 类型    | 待审核 | 通过后 | 拒绝后 |
|---------|--------|--------|--------|
| post    | pending | approved | rejected |
| product | pending | active   | rejected |
| comment | pending | approved | rejected |
| profile | pending | approved | approved（清空 pending_*）|

### 验证点 3: AI 翻译与话题抽取完成且写入正确表 ✅

- 帖子: `posts.content_translated`、`content_lang`
- 评论: `comments.content_translated`、`content_lang`
- 商品: `products.name_translated`、`description_translated`、`details_translated`、`category_translated`、`faq_translated`、`content_lang`
- 资料: `profiles.display_name_translated`、`bio_translated`、`location_translated`、`content_lang`
- 话题: `post_topics`、`topics`

### 验证点 4: 通知触发到正确目标用户 ✅

| 事件                 | 通知目标     | 触发器 / 来源        |
|----------------------|--------------|----------------------|
| 帖子审核通过/拒绝    | 帖子作者     | 数据库触发器         |
| 商品审核通过/拒绝    | 卖家         | 数据库触发器         |
| 评论审核通过         | 帖子作者等   | 数据库触发器         |
| 帖子审核通过（粉丝） | 粉丝         | 数据库触发器         |
| 资料审核通过         | 被审核用户   | approve-profile API  |

### 验证点 5: logAudit 完整记录每个关键操作 ✅

| 操作           | action               | 来源                          |
|----------------|----------------------|-------------------------------|
| 内容审核通过   | approve_content      | content-review approve API    |
| 内容审核拒绝   | reject_content       | content-review reject API     |
| 资料审核通过   | approve_profile      | approve-profile API           |
| 资料审核拒绝   | reject_profile       | reject-profile API            |
| 帖子 AI 翻译   | ai_translate_post    | translate-after-publish API   |
| 评论 AI 翻译   | ai_translate_comment | translate-after-publish API   |
| 商品 AI 翻译   | ai_translate_product | translate-after-publish API   |
| 话题 AI 抽取   | ai_extract_topics    | extract-topics-after-approval |
| 资料 AI 翻译   | ai_translate_profile | translate-profile-after-approval |

### 验证点 6: Cron 批量任务 ⚠️

**现状**: 未发现批量翻译/话题抽取的 Cron 任务。

**建议**: 如需实现，可增加 Cron 任务扫描待翻译/待抽取内容，调用对应 AI API。

---

## 四、修改文件清单

| 文件路径 | 修改类型 |
|----------|----------|
| `src/app/api/admin/content-review/[id]/approve/route.ts` | 新增 |
| `src/app/api/admin/content-review/[id]/reject/route.ts` | 新增 |
| `src/app/api/admin/profiles/[id]/approve-profile/route.ts` | 添加通知、调整 logAudit |
| `src/app/api/admin/profiles/[id]/reject-profile/route.ts` | 调整 logAudit action |
| `src/app/api/ai/translate-after-publish/route.ts` | 添加 logAudit |
| `src/app/api/ai/extract-topics-after-approval/route.ts` | 添加 logAudit |
| `src/app/api/ai/translate-profile-after-approval/route.ts` | 添加 logAudit |
| `src/components/admin/ContentReview.tsx` | 改用 API、国际化 |
| `src/app/[locale]/(main)/admin/profile-review/ProfileReviewClient.tsx` | 国际化 |
| `src/app/[locale]/(main)/admin/review/page.tsx` | 国际化 |
| `src/messages/zh.json` | 新增翻译键 |
| `src/messages/en.json` | 新增翻译键 |

---

## 五、架构特点

### 优点

1. **审核通知**: 帖子、商品、评论、资料审核均通过触发器或 API 发送通知
2. **AI 流程**: 审核通过后自动触发翻译与话题抽取
3. **审计覆盖**: 所有关键审核与 AI 操作均记录 logAudit
4. **权限控制**: content-review 与 profile 审核均校验 admin/support 角色

### 设计说明

- 内容审核由直接 Supabase 更新改为 API 调用，便于审计与扩展
- 帖子/商品审核通过会更新 `reviewed_by`、`reviewed_at`，评论表无该字段
- 通知通过 `content_key` + `content_params` 支持国际化

---

## 六、结论

内容与资料审核及 AI 处理链路核心流程已打通。主要修复包括：新增 content-review API 并记录 logAudit、资料审核通过增加通知、AI 相关 API 补全 logAudit、审核相关页面国际化。所有验证点均已满足（Cron 批量任务除外）。

**状态**: ✅ 审计完成，所有发现问题已修复
