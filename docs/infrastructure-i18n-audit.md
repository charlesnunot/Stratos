# 基础设施与国际化（i18n）— 审计报告

**审计范围**：多语言与路由、权限校验、错误处理、追踪与日志、性能与稳定性  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 国际化与路由

**文件与配置**：`i18n/config.ts`、`i18n/routing.ts`、`i18n/navigation.ts`、`i18n/request.ts`；页面为带 `[locale]` 前缀的路由（如 /en、/zh）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 多语言切换是否正常，内容是否正确显示 | **通过**：config 定义 locales en/zh、defaultLocale en；routing 使用 localePrefix: 'always'；request 校验 locale 并动态加载 `../messages/${locale}.json`；LanguageSwitcher 使用 i18n 的 useRouter/usePathname，`router.replace(pathname, { locale: newLocale })` 切换语言；[locale] layout 校验 locale 无效则 notFound()。 | 通过 | 无。 |
| 不同语言下路由访问权限是否一致 | **通过**：权限校验在页面与 API 内完成，与 locale 无关；admin/support/seller 等按 role 或订阅判断，不依赖语言。 | 通过 | 无。 |
| 前端和后端路由国际化一致性 | **通过**：middleware 对无有效 locale 前缀的路径重定向到 `/${defaultLocale}${pathname}`（307）；根路径 /login、/post/[id]、/profile/[[...slug]] 为重定向页，均 redirect 到 `/${defaultLocale}/...`；根 / 重定向到 defaultLocale；API 无 locale 路径，与 i18n 解耦。 | 通过 | 无。 |

---

## 2. 权限校验

**库函数**：`require-admin`（requireAdmin、requireAdminOrSupport）、`check-seller`（checkSellerPermission、useSellerGuard）。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 权限校验是否在所有相关页面和 API 生效 | **通过**：admin API 使用 requireAdmin 或 requireAdminOrSupport；admin 页面均校验 profile.role；卖家相关 API（deposits/check、deposits/pay、orders/ship、payment-accounts）使用 checkSellerPermission；卖家页面使用 useSellerGuard。 | 通过 | 无。 |
| 非授权用户访问敏感页面或接口是否安全阻止 | **通过**：requireAdmin 未登录 401、非 admin 403；useSellerGuard 未登录跳转登录、非卖家跳转 redirectTo；页面侧非权限用户 redirect('/') 或 redirect 登录。 | 通过 | 无。 |

---

## 3. 错误处理

**全局错误捕获**：Error Boundaries（error.tsx、global-error.tsx、[locale]/(main)/error.tsx）；API 错误返回。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 前端错误不会泄露敏感信息 | **部分**：error.tsx、global-error.tsx、main error.tsx 均向用户展示 `error.message`；若错误来自服务端或内部（如 DB/第三方），message 可能含堆栈、路径、内部描述，存在泄露风险。 | **中** | 生产环境下不向用户展示原始 error.message，仅展示通用文案（如「发生错误，请重试」）；完整错误仅记录到 console 或服务端日志。 |
| 后端 API 错误返回安全信息 | **部分**：使用 handleApiError 的 API（如 ai/complete、platform-payment-accounts）返回 userMessage（getUserFriendlyMessage），安全；部分 API 在 catch 中直接返回 `error.message`，可能泄露内部信息。 | **低** | 建议关键 API 统一使用 handleApiError 或返回通用文案；已有 handleApiError 的保持现状。 |
| 错误日志是否可追踪、去敏感化 | **通过**：handleApiError 使用 createApiError + logApiError，日志含 requestId、userMessage、type、statusCode，sanitizeErrorForLogging 脱敏敏感字段；支付侧 createPaymentError、logPaymentError 使用 getUserFriendlyMessage 与 sanitizeError。 | 通过 | 无。 |

---

## 4. 追踪与日志

**模块**：`/api/track/view`、`/api/track/critical-path`；前端关键路径追踪。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 浏览和操作事件是否正确记录 | **通过**：track/view 校验 entityType、entityId（UUID），写入 view_events（entity_type、entity_id、viewer_id、session_id、owner_id）；critical-path 接收 name、durationMs、outcome、meta 写入 server log。 | 通过 | 无。 |
| 日志不泄露敏感数据 | **部分**：track/view 不记录用户输入原文；critical-path 将 `body?.meta` 原样写入 console.log，若前端传入 PII 会进入日志。 | **低** | critical-path 不记录 meta 原文，或仅记录 key 列表/脱敏后摘要。 |
| 日志可用于问题定位和审计 | **通过**：view_events 表可查浏览记录；critical-path 含 traceId、name、outcome、durationMs，便于定位；API 错误日志含 requestId、type、userMessage。 | 通过 | 无。 |

---

## 5. 性能与稳定性

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 多语言页面加载性能 | **通过**：request.ts 按 locale 动态 import 对应 messages JSON，无多余语言包加载；[locale] layout 一次 getMessages()。 | 通过 | 无。 |
| 异常请求是否有合理 fallback | **通过**：middleware 中 updateSession 失败仅 log，不阻断请求；环境变量校验失败时生产环境返回 503、开发环境继续；无效 locale 重定向 defaultLocale；AbortError 在 Error Boundary 中静默处理不展示 UI。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | Error Boundary 展示 error.message | 前端错误页展示原始 message，可能泄露内部/堆栈信息 | **中** | 生产环境仅展示通用文案，不展示 error.message |
| 2 | critical-path 记录 meta 原文 | body.meta 原样写入日志，可能含 PII | **低** | 不记录 meta 原文或仅记录脱敏摘要/key |
| 3 | 部分 API 直接返回 error.message | 可能泄露内部错误描述 | **低** | 建议关键 API 使用 handleApiError 或通用文案 |

---

## 7. 已采用的正确实践（无需修改）

- **i18n**：config/routing/request 一致，localePrefix always，无 locale 路径重定向 defaultLocale；根 /login、/post、/profile 重定向到 locale 路径。
- **权限**：requireAdmin/requireAdminOrSupport、checkSellerPermission、useSellerGuard 在相关 API 与页面生效。
- **API 错误**：handleApiError 返回 userMessage，日志脱敏；支付错误使用 createPaymentError/userMessage。
- **追踪**：track/view 校验类型与 UUID；critical-path 不写 DB、不阻塞请求；AbortError 静默处理。

---

## 8. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | Error Boundary 展示 error.message | **已修复**：error.tsx、global-error.tsx、[locale]/(main)/error.tsx 在生产环境不向用户展示 error.message，仅展示通用文案「发生错误，请重试」；开发环境仍展示 message 便于调试。 |
| 2 | critical-path 记录 meta 原文 | **已修复**：/api/track/critical-path 不再将 body.meta 原样写入日志，仅记录 name、traceId、outcome、durationMs；若需审计可后续增加 meta keys 或脱敏摘要。 |

---

**审计结论**：基础设施与 i18n 在路由、权限、追踪与 fallback 方面整体良好；**主要改进点**为 **前端 Error Boundary 生产环境不展示原始 error.message**（中）与 **critical-path 不记录 meta 原文**（低）。建议优先完成上述两项修复。
