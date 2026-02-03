# 推演任务 14 — 内容审核与 AI 翻译/话题抽取链路审计报告

## 审计概述

**任务**: 内容审核与 AI 处理全链路测试 (Content Review & AI Processing Full Linkage Test)  
**日期**: 2026-01-31  
**状态**: ✅ 全部问题已修复

---

## 验证链路

### 1. 管理员审核内容

#### 1.1 审核通过 (Approve)

**API**: `POST /api/admin/content-review/[id]/approve`

**支持的内容类型**: post, product, comment

**流程验证**:
- ✅ 权限验证：仅 admin/support 可操作
- ✅ 状态验证：只能审核 pending 状态的内容
- ✅ 更新状态：post/comment → approved, product → active
- ✅ 记录审核者：reviewed_by, reviewed_at
- ✅ 审计日志：logAudit(action='approve_content')
- ✅ 自动触发 AI 翻译（post/product/comment）
- ✅ 自动触发话题抽取（post only）
- ✅ AI 失败不阻塞审核（异步调用）

**新增功能**: 
- 审核通过后自动调用 `/api/ai/translate-after-publish`
- 对于帖子，额外调用 `/api/ai/extract-topics-after-approval`
- 所有 AI 调用异步执行，失败写入 logAudit

#### 1.2 审核拒绝 (Reject)

**API**: `POST /api/admin/content-review/[id]/reject`

**流程验证**:
- ✅ 权限验证：仅 admin/support 可操作
- ✅ 状态验证：只能拒绝 pending 状态的内容
- ✅ 更新状态为 rejected
- ✅ 记录审核者：reviewed_by, reviewed_at
- ✅ 审计日志：logAudit(action='reject_content')
- ✅ 通知内容所有者（使用 content_key 国际化）

**新增功能**:
- 拒绝后自动通知内容所有者
- 通知使用 content_key: post_rejected, product_rejected, comment_rejected

---

### 2. Profile 审核

#### 2.1 Profile 审核通过

**API**: `POST /api/admin/profiles/[id]/approve-profile`

**流程验证**:
- ✅ 权限验证：仅 admin/support 可操作
- ✅ 状态验证：profile_status = 'pending'
- ✅ 应用 pending_* 字段到主字段
- ✅ 清空所有 pending_* 字段
- ✅ 更新 profile_status = 'approved'
- ✅ 审计日志：logAudit(action='approve_profile')
- ✅ 通知用户（content_key: profile_approved）
- ✅ 自动触发 AI 翻译

**新增功能**:
- 审核通过后自动调用 `/api/ai/translate-profile-after-approval`
- 翻译 display_name, bio, location 字段

#### 2.2 Profile 审核拒绝

**API**: `POST /api/admin/profiles/[id]/reject-profile`

**流程验证**:
- ✅ 权限验证：仅 admin/support 可操作
- ✅ 清空所有 pending_* 字段
- ✅ 保持主字段不变
- ✅ 更新 profile_status = 'approved'
- ✅ 审计日志：logAudit(action='reject_profile')
- ✅ 通知用户

**新增功能**:
- 拒绝后自动通知用户（content_key: profile_rejected）

---

### 3. AI 翻译服务

#### 3.1 内容翻译

**API**: `POST /api/ai/translate-after-publish`

**支持类型**: post, product, comment

**流程验证**:
- ✅ 权限验证：内容所有者或 admin/support
- ✅ 语言检测：detectContentLanguage
- ✅ 目标语言：自动选择对应翻译语言
- ✅ 调用 DeepSeek API 进行翻译
- ✅ 写入译文字段：content_translated, name_translated 等
- ✅ 写入语言标识：content_lang
- ✅ 审计日志：logAudit(action='ai_translate_post/product/comment')

**特殊处理**:
- 帖子审核通过后，同时翻译该帖下所有评论
- 商品翻译包括：name, description, details, category, faq
- FAQ 翻译：逐条翻译 question 和 answer

**异常处理**:
- ✅ 整个函数包裹在 try-catch 中
- ✅ AI 服务失败返回 500 但不抛出错误
- ✅ 失败写入 logAudit (result='fail')
- ✅ 不记录原文内容到日志

#### 3.2 Profile 翻译

**API**: `POST /api/ai/translate-profile-after-approval`

**翻译字段**: display_name, bio, location

**流程验证**:
- ✅ 权限验证：仅 admin/support 可调用
- ✅ 语言检测和目标语言选择
- ✅ 写入译文：display_name_translated, bio_translated, location_translated
- ✅ 写入 content_lang
- ✅ 审计日志：logAudit(action='ai_translate_profile')

**异常处理**:
- ✅ 完整的 try-catch
- ✅ 失败记录审计日志

#### 3.3 话题抽取

**API**: `POST /api/ai/extract-topics-after-approval`

**流程验证**:
- ✅ 权限验证：仅 admin/support 可调用
- ✅ 提取话题：extractTopicsOnServer
- ✅ 去重：与已有话题比对
- ✅ 创建或关联话题
- ✅ 话题翻译：自动翻译新话题名称
- ✅ Slug 生成：ensureCanonicalSlug
- ✅ 审计日志：logAudit(action='ai_extract_topics', meta.topicsAdded)

**异常处理**:
- ✅ 完整的 try-catch
- ✅ 失败记录审计日志

---

### 4. 数据库触发器

#### 4.1 帖子审核通知

**触发器**: `trigger_create_post_review_notification`  
**条件**: status 从 pending → approved/rejected

- ✅ 通知用户审核结果
- ✅ 使用 content_key: post_approved, post_rejected
- ✅ 异常处理：失败仅记录 WARNING

#### 4.2 粉丝通知

**触发器**: `trigger_notify_followers_on_post_approval`  
**条件**: status 从 pending → approved

- ✅ 通知所有粉丝（最多 1000 人）
- ✅ 使用 content_key: following_new_post
- ✅ 包含帖子预览（30 字符）
- ✅ SECURITY DEFINER 权限

#### 4.3 商品审核通知

**触发器**: 类似帖子审核通知  
**content_key**: product_approved, product_rejected

---

### 5. 通知完整性

| 场景 | 通知对象 | content_key | 触发方式 |
|------|----------|-------------|----------|
| 帖子审核通过 | 作者 | post_approved | DB 触发器 |
| 帖子审核拒绝 | 作者 | post_rejected | DB 触发器 |
| 商品审核通过 | 卖家 | product_approved | DB 触发器 |
| 商品审核拒绝 | 卖家 | product_rejected | DB 触发器 |
| 评论审核拒绝 | 作者 | comment_rejected | API 直接插入 |
| Profile 审核通过 | 用户 | profile_approved | API 直接插入 |
| Profile 审核拒绝 | 用户 | profile_rejected | API 直接插入 |
| 帖子发布 | 所有粉丝 | following_new_post | DB 触发器 |

---

### 6. 审计日志覆盖

| 操作 | action | 记录内容 |
|------|--------|----------|
| 审核通过 | approve_content | resourceId, resourceType (post/product/comment) |
| 审核拒绝 | reject_content | resourceId, resourceType |
| Profile 审核通过 | approve_profile | resourceId (profileId) |
| Profile 审核拒绝 | reject_profile | resourceId (profileId) |
| AI 翻译帖子 | ai_translate_post | resourceId (不记录内容) |
| AI 翻译商品 | ai_translate_product | resourceId (不记录内容) |
| AI 翻译评论 | ai_translate_comment | resourceId (不记录内容) |
| AI 翻译 Profile | ai_translate_profile | resourceId (不记录内容) |
| AI 抽取话题 | ai_extract_topics | resourceId, meta.topicsAdded |
| AI 服务失败 | ai_translate_*, ai_extract_topics | result='fail', meta.reason |

**敏感信息保护**:
- ✅ 不记录帖子/评论/商品原文
- ✅ 不记录翻译结果
- ✅ 不记录用户个人敏感信息
- ✅ 仅记录操作结果和元数据（如话题数量）

---

## 发现的问题与修复

### 问题 1: 审核通过后未自动触发 AI 翻译

**问题描述**: 审核 API 没有调用 AI 翻译服务，导致内容审核通过后没有译文。

**影响范围**: post, product, comment, profile

**修复方案**:
- `approve\route.ts`: 添加异步 fetch 调用 AI 翻译 API
- `approve-profile\route.ts`: 添加异步 fetch 调用 Profile 翻译 API
- 使用 `.catch()` 捕获错误，不阻塞审核流程
- 失败时写入 logAudit

**代码示例**:
```typescript
fetch(`${request.nextUrl.origin}/api/ai/translate-after-publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
  body: JSON.stringify({ type: 'post', id }),
}).catch((err) => {
  console.error('[approve] translate failed:', id, err)
  logAudit({
    action: 'ai_translate_post',
    userId: user.id,
    resourceId: id,
    resourceType: 'post',
    result: 'fail',
    timestamp: new Date().toISOString(),
    meta: { reason: err.message || 'Translation service failed' },
  })
})
```

### 问题 2: 审核通过后未自动触发话题抽取

**问题描述**: 帖子审核通过后没有自动提取话题标签。

**修复方案**:
- `approve\route.ts`: 对 post 类型，额外调用 `/api/ai/extract-topics-after-approval`
- 异步执行，失败不阻塞审核

### 问题 3: 审核拒绝时缺少通知

**问题描述**: 
- content-review API 的 reject 路由没有发送通知
- profile reject API 没有发送通知

**修复方案**:
- `reject\route.ts`: 查询内容所有者，插入通知
- `reject-profile\route.ts`: 插入拒绝通知
- 使用 content_key 支持国际化

### 问题 4: AI API 缺少异常处理

**问题描述**: AI API 没有完整的 try-catch，失败时可能导致未捕获错误。

**修复方案**:
- 所有 AI API 添加顶层 try-catch
- 捕获所有错误并返回结构化响应
- 失败时写入 logAudit (result='fail')

**修复文件**:
- `translate-after-publish\route.ts`
- `translate-profile-after-approval\route.ts`
- `extract-topics-after-approval\route.ts`

### 问题 5: 缺少 i18n 翻译键

**问题描述**: 
- `comment_rejected` 翻译键不存在
- `profile_rejected` 翻译键不存在

**修复方案**:
- `en.json`: 添加 comment_rejected, profile_rejected
- `zh.json`: 添加对应中文翻译

---

## 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/app/api/admin/content-review/[id]/approve/route.ts` | 添加 AI 翻译和话题抽取异步调用 |
| `src/app/api/admin/content-review/[id]/reject/route.ts` | 添加拒绝通知 |
| `src/app/api/admin/profiles/[id]/approve-profile/route.ts` | 添加 Profile 翻译异步调用 |
| `src/app/api/admin/profiles/[id]/reject-profile/route.ts` | 添加拒绝通知 |
| `src/app/api/ai/translate-after-publish/route.ts` | 添加完整异常处理和失败日志 |
| `src/app/api/ai/translate-profile-after-approval/route.ts` | 添加完整异常处理和失败日志 |
| `src/app/api/ai/extract-topics-after-approval/route.ts` | 添加完整异常处理和失败日志 |
| `src/messages/en.json` | 添加 comment_rejected, profile_rejected |
| `src/messages/zh.json` | 添加 comment_rejected, profile_rejected |

---

## 验证清单

- [x] 权限校验：仅 admin/support 可 approve/reject
- [x] AI 翻译调用：审核通过后自动触发
- [x] 话题抽取调用：帖子审核通过后自动触发
- [x] AI 失败不阻塞：异步调用，失败写日志
- [x] DB 更新正确：translated_content, topics 正确写入
- [x] 原文不记录：logAudit 不包含敏感内容
- [x] 通知完整性：审核结果通知所有相关用户
- [x] 异常处理：AI 服务失败写 logAudit(result='fail')
- [x] 审核不回滚：AI 异常不影响审核状态更新

---

## AI 服务流程图

```
审核通过 (approve)
    ↓
更新状态 + logAudit
    ↓
[异步] 调用 AI 翻译
    ├─ 成功 → 写入译文 + logAudit(success)
    └─ 失败 → logAudit(fail, reason)
    ↓ (仅帖子)
[异步] 调用话题抽取
    ├─ 成功 → 创建话题 + logAudit(success, topicsAdded)
    └─ 失败 → logAudit(fail, reason)
    ↓
返回 { ok: true } 给前端
```

**关键设计原则**:
1. **非阻塞**: AI 调用异步执行，不等待结果
2. **容错性**: AI 失败不影响审核状态
3. **可追溯**: 所有 AI 操作（成功/失败）都有审计日志
4. **隐私保护**: 不记录原文内容到日志

---

## 数据库表更新

### posts 表
- `content_translated`: TEXT (翻译后的内容)
- `content_lang`: TEXT (原文语言: zh/en)
- `reviewed_by`: UUID (审核者)
- `reviewed_at`: TIMESTAMPTZ (审核时间)

### products 表
- `name_translated`: TEXT
- `description_translated`: TEXT
- `details_translated`: TEXT
- `category_translated`: TEXT
- `faq_translated`: JSONB
- `content_lang`: TEXT

### comments 表
- `content_translated`: TEXT
- `content_lang`: TEXT

### profiles 表
- `display_name_translated`: TEXT
- `bio_translated`: TEXT
- `location_translated`: TEXT
- `content_lang`: TEXT
- `profile_status`: TEXT (pending/approved)

### topics 表
- `name_translated`: TEXT
- `name_lang`: TEXT
- `slug`: TEXT (canonical ASCII slug)

---

## 结论

内容审核与 AI 处理链路全部验证通过。所有发现的问题已完全修复，包括：

1. **自动化**: 审核通过后自动触发 AI 翻译和话题抽取
2. **容错性**: AI 服务失败不阻塞审核流程
3. **通知完整性**: 审核结果（通过/拒绝）通知所有相关用户
4. **审计追踪**: 所有操作都有完整的审计日志
5. **隐私保护**: 不记录敏感内容到日志
6. **异常处理**: 所有 API 都有完整的错误处理机制
