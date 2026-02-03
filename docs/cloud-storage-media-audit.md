# 云存储与媒体资源管理 — 审计报告

**审计范围**：文件上传与校验、云存储访问控制、迁移与同步、数据完整性与回滚、日志与监控  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 文件上传与校验

**页面与接口**：帖子/商品/评论/头像/带货帖上传；上传为客户端直写 Supabase Storage（无独立 /api/upload）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 文件类型和大小校验正确 | **部分**：useImageUpload（帖子、商品、评论、头像、商品评论/评价）在 handleImageSelect 与 uploadImages 中校验类型（image/jpeg、png、gif、webp）与大小（5MB）；CommentSection 内联评论图片上传亦有 ALLOWED_TYPES/MAX_FILE_SIZE。**ImageUpload 组件**（仅用于带货帖 promote 页）**未**做类型与大小校验，接受任意文件。 | **中** | 在 ImageUpload 的 handleFileSelect 与 uploadImages 中增加与 useImageUpload 一致的 ALLOWED_TYPES、MAX_FILE_SIZE（5MB）校验，非法文件 toast 提示或抛错。 |
| 上传接口仅允许授权用户操作 | **通过**：useImageUpload/ImageUpload 均要求 useAuth().user，未登录时 uploadImages 抛错；Supabase Storage 依赖 RLS/策略（如 avatars 仅允许 authenticated 写入自身路径）。 | 通过 | 无。 |
| 防止恶意文件上传（如可执行文件、脚本） | **部分**：useImageUpload 与 CommentSection 仅允许图片 MIME；ImageUpload 未校验，可上传 .exe、.js 等。 | **中** | 同上：ImageUpload 增加类型与大小校验。 |

---

## 2. 云存储访问控制

**接口**：无统一 /api/cloudinary 上传接口；迁移接口为 /api/cloudinary/migrate-*。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 私密资源（如用户头像、未发布帖子图片）只能被授权用户访问 | **部分**：Supabase 文档建议 avatars/posts 桶可配置为公开读（getPublicUrl）；未发布帖子图片若存于公开桶且路径可猜，则任何人持 URL 可访问。当前设计为公开桶 + 路径含 user_id/timestamp，无签名。 | **低** | 可选：对敏感资源使用私有桶 + 签名 URL 或通过后端代理读取。 |
| 公共资源访问权限是否正确 | **通过**：已发布帖子/商品图片、头像等使用 getPublicUrl，CDN/Cloudinary 迁移后为公开 URL，符合“公开资源”预期。 | 通过 | 无。 |
| URL 签名或访问令牌是否安全 | **通过**：Cloudinary 服务端上传使用 API Key + timestamp + SHA1 签名，密钥仅服务端持有；迁移接口仅 admin/support 可调。 | 通过 | 无。 |

---

## 3. 迁移与同步

**接口**：/api/cloudinary/migrate-post-images、migrate-profile-avatar、migrate-product-images、migrate-comment-images。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 历史迁移任务或批量同步 | **通过**：迁移接口按单帖/单 profile 等触发；先全部拉取 Supabase 图片并上传 Cloudinary，全部成功后再更新 DB 并删除 Supabase 原文件，避免半成功状态。 | 通过 | 无。 |
| 文件路径、名称、元数据是否一致 | **通过**：从 Supabase 公开 URL 解析 path，上传 Cloudinary 后以 secure_url 写回 DB；path 解析与桶前缀一致。 | 通过 | 无。 |
| 异常迁移是否可追踪 | **部分**：失败时 console.error 记录 postId/url/reason；返回 500 与 failedCount、firstReason 等；无写入审计表或 cron_logs。 | **低** | 可选：迁移失败时写入 logAudit 或专用 migration_logs（job、resourceId、result、reason）。 |

---

## 4. 数据完整性与回滚

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 删除或更新文件操作是否同步更新数据库记录 | **通过**：迁移流程为“先全部上传成功 → 更新 DB image_urls/pending_avatar_url → 再删除 Supabase 文件”；删除失败仅 log，不回滚 DB，避免 DB 已指向 Cloudinary 而 Supabase 仍保留的长期不一致。 | 通过 | 无。 |
| 异常操作是否可回滚 | **通过**：单张迁移失败则整次迁移不更新 DB、不删 Supabase，可重试。 | 通过 | 无。 |
| 文件冗余或备份策略是否存在 | **部分**：迁移后 Supabase 原文件被删除，仅 Cloudinary 保留；无应用层备份策略，依赖 Cloudinary/供应商可靠性。 | **低** | 可选：业务要求高时可考虑双写或定期备份。 |

---

## 5. 日志与监控

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 上传、下载、删除、迁移操作是否有日志 | **部分**：客户端上传无服务端日志；迁移接口有 console.log/console.error（成功/失败、postId、migrated 数、失败原因）。 | **低** | 可选：迁移成功/失败写 logAudit 或 migration_logs 便于审计。 |
| 日志中不泄露敏感信息 | **通过**：日志含 postId、profileId、URL 前缀、reason，不含密码或完整 token；Cloudinary 密钥仅服务端使用不落日志。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | ImageUpload 未校验类型与大小 | 带货帖使用 ImageUpload，可上传任意类型/大小文件 | **中** | 在 ImageUpload 中增加 ALLOWED_TYPES、5MB 限制 |
| 2 | 迁移失败无审计记录 | 仅 console + 500 响应，无 logAudit | **低** | 可选：迁移失败/成功写 logAudit |
| 3 | 未发布图片为公开桶 | 若路径可猜则任何人可访问 | **低** | 可选：私有桶 + 签名 URL |

---

## 7. 已采用的正确实践（无需修改）

- **useImageUpload**：类型（jpeg/png/gif/webp）、大小（5MB）、授权用户；CommentSection 内联上传同样校验。
- **迁移**：admin/support 鉴权；先全量上传成功再改 DB 再删 Supabase；单张失败整次不提交。
- **Cloudinary**：服务端签名上传；迁移接口 403/401 正确。
- **RLS**：avatars 等桶通过文档说明配置 INSERT/SELECT/DELETE 策略，路径含 user_id。

---

## 8. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | ImageUpload 未校验类型与大小 | **已修复**：在 ImageUpload 的 handleFileSelect 中过滤 ALLOWED_TYPES（image/jpeg、jpg、png、gif、webp）、MAX_FILE_SIZE 5MB，非法文件 toast 提示且不加入列表；在 uploadImages 中再次校验类型与大小，不通过则抛错，避免恶意请求绕过前端。 |

---

**审计结论**：上传与迁移在权限、迁移原子性和日志脱敏方面整体良好；**主要问题**为 **ImageUpload 组件未做文件类型与大小校验**（中），已按 useImageUpload 标准补齐。可选：迁移审计日志、未发布资源私有桶+签名 URL。
