# 认证与账号安全模块 — 系统性审计报告

**审计范围**：登录、注册、找回密码、封禁页及相关 API 与中间件  
**审计日期**：2025-01-31  
**结论**：按检查点逐项列出问题描述、风险等级与建议修复方案，便于追踪。

---

## 1. 路由与访问控制

### 1.1 未登录用户访问封禁页

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 未登录用户访问 `/{locale}/banned` | 可访问 | **低** | 封禁页位于 `(main)/banned`，无服务端鉴权。未登录用户可直接打开并看到「账户已被禁用」等文案，易造成误解。**建议**：在封禁页服务端或布局中判断「仅当已登录且 profile.status 为 banned/suspended 才渲染内容」，否则重定向到首页或登录页。 |

**当前逻辑**：中间件仅在「已登录 + profile 为 banned/suspended」时重定向到 `/banned`，未限制「未登录访问 /banned」本身。

---

### 1.2 登录用户访问登录/注册/找回密码页的重定向

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 已登录用户访问 `/auth/login` | 未重定向 | **中** | `login/page.tsx` 未在服务端或客户端检查现有 session，已登录用户仍可看到登录表单。**建议**：在登录页（服务端或客户端 onMount）若检测到有效 session，则重定向到 `redirect` 参数或首页。 |
| 已登录用户访问 `/auth/register` | 未重定向 | **中** | 同上，注册页未做「已登录则跳转」。**建议**：同登录页，已登录则重定向到首页或 `redirect`。 |
| 已登录用户访问 `/auth/forgot-password` | 未重定向 | **低** | 未做已登录检查。**建议**：已登录用户可重定向到首页或设置页，避免误用找回密码。 |
| 已登录用户访问 `/auth/reset-password` | 有检查 | 通过 | `reset-password/page.tsx` 在 `useEffect` 中通过 `getSession()` 检查，无 session 时重定向到登录页；有 session 时保留（用于从找回密码链接带来的 session），逻辑合理。 |

---

### 1.3 前端访问控制与后端一致性

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 封禁页 | 一致 | 通过 | 封禁判断仅在中间件（服务端）做，无单独「封禁状态」API；前端封禁页不依赖额外后端接口，与中间件行为一致。 |
| 登录/注册 | 一致 | 通过 | 登录/注册直接调用 Supabase Client（`signInWithPassword` / `signUp`），无自建 `/api/auth/login` 或 `/api/auth/register`；鉴权与限流由 Supabase 负责，前后端一致。 |
| 重定向 URL | 安全 | 通过 | 登录成功后使用 `validateRedirectUrl(redirectParam, '/')` 并剥离 locale 前缀，防止开放重定向；危险协议（如 `javascript:`）已被拦截。 |

**路径说明**：实际路由为 `[locale]` 下的 `(auth)` / `(main)`，对应访问路径为 `/{locale}/auth/login`、`/{locale}/auth/register`、`/{locale}/auth/forgot-password`、`/{locale}/auth/reset-password`、`/{locale}/banned`。无 locale 的 `/login` 等由 `src/app/login/page.tsx` 等重定向到 `/{defaultLocale}/login`。

---

## 2. 密码安全

### 2.1 传输与存储

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 密码是否通过 HTTPS 传输 | 依赖部署 | **中** | 应用未强制 HTTPS；若生产未配置 TLS，密码会明文传输。**建议**：在生产环境强制 HTTPS（Vercel/反向代理 配置 + 可选 HSTS），并在文档中明确要求。 |
| 数据库是否存储密码哈希 | 是 | 通过 | 认证由 Supabase Auth（GoTrue）负责，密码以 bcrypt 哈希存于 `auth.users.encrypted_password`，项目内无明文密码存储。 |
| 注册/重置密码流程 | 合规 | 通过 | 注册使用 `supabase.auth.signUp()`，重置使用 `supabase.auth.updateUser({ password })`，均由 Supabase 服务端哈希后写入。 |

### 2.2 忘记密码链接

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 链接过期时间 | 由 Supabase 管理 | 通过 | Supabase 服务端管理找回密码 token 过期时间，需在 Supabase Dashboard → Auth 中确认配置符合策略（如 1 小时）。 |
| 一次性使用 | 是 | 通过 | 使用 `exchangeCodeForSession(code)` 后，同一 code 再次使用会报错（如 "Email link is invalid or was expired"），符合一次性使用。 |

---

## 3. 防止暴力攻击

### 3.1 登录接口（Supabase Auth）

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 限流机制 | 由 Supabase 提供 | 通过 | 登录通过 Supabase Client 调用，Supabase 服务端有限流；前端已处理 `too_many_requests` 并展示 `t('tooManyRequests')`。 |
| 登录失败次数/账户锁定 | 依赖 Supabase | **低** | 项目未实现自定义「N 次失败后锁定账户」逻辑。**建议**：在 Supabase Dashboard 查看是否可配置锁定策略；若有需求可在应用层用 DB 记录失败次数并在一段时间内拒绝再次尝试。 |
| 验证码/防刷 | 无 | **中** | 登录页无验证码或 reCAPTCHA。**建议**：对登录/注册/找回密码表单增加 reCAPTCHA 或 Supabase 支持的 Bot 防护，降低撞库与自动化攻击。 |

### 3.2 注册与自建 Auth API

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 注册防刷 | 依赖 Supabase | **低** | 注册为 `supabase.auth.signUp()`，限流由 Supabase 负责；前端无额外防刷。可选：在注册前增加验证码。 |
| `/api/auth/validate-password` 限流 | 无限流 | **中** | 该接口接收明文密码做强度校验，未使用 `withApiLogging` 或 `checkRateLimit`，可被滥用于暴力尝试或 DoS。**建议**：对该路由按 IP（及可选 userId）应用 `RateLimitConfigs.AUTH`（如 10 次/分钟），并与登录/注册流程一致地考虑验证码。 |

**说明**：项目存在 `src/lib/api/rate-limit.ts`（含 `RateLimitConfigs.AUTH`）和 `withApiLogging` 的 rateLimit 能力，但 `validate-password` 未使用。

---

## 4. 敏感信息保护

### 4.1 API 返回内容

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 密码/密码哈希泄露 | 未泄露 | 通过 | `/api/auth/validate-password` 仅返回 `valid`、`strength`、`errors`，不返回密码或哈希；登录/注册走 Supabase，响应由 Supabase 控制，项目未在响应中附带密码相关字段。 |
| 内部 ID/账户状态泄露 | 未发现 | 通过 | 审计范围内 auth 相关 API（validate-password、logout）未返回内部用户 ID、账户状态或 profile 敏感字段。其他接口未在本次审计中逐条检查，建议后续对「用户信息」类 API 做脱敏与最小化返回。 |

### 4.2 错误信息

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 登录错误信息 | 已映射 | 通过 | 登录页将 `invalid_credentials`、`email_not_confirmed`、`too_many_requests` 等映射为统一文案，避免向用户暴露详细错误码或堆栈。 |
| validate-password 错误 | 可控 | 通过 | 返回的 `errors` 为规则类提示（如「建议包含小写字母」），不包含用户输入或内部信息。 |

---

## 5. 异常与日志

### 5.1 异常登录/操作的日志

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 登录成功/失败日志 | 未在应用层记录 | **中** | 登录在浏览器端通过 Supabase Client 完成，应用服务端不收到登录请求，因此无自定义「登录成功/失败」日志。**建议**：依赖 Supabase Dashboard 的 Auth 日志做审计；若需在自有系统内审计，可考虑 Supabase Auth Hooks 或 Webhook 将登录事件同步到自有日志/数据库。 |
| 注册/找回密码 | 同上 | **低** | 同样由 Supabase 处理，可依赖 Supabase 日志；若有合规要求可增加 Hooks/Webhook。 |
| Auth 相关 API | 部分有日志 | **低** | `validate-password` 在 catch 中使用 `console.error('Password validation error:', error)`，未使用统一 `logApiRequest`；`logout` 无业务日志。**建议**：对 validate-password、logout 使用统一 API 日志（含 path、status、duration、requestId），且不记录 request body，便于审计与排错。 |

### 5.2 日志中敏感数据

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 不记录密码或 body | 未发现记录 body | 通过 | `createApiLogEntry` 仅记录 path、userId、statusCode、duration、error 等，不记录请求体；validate-password 的 catch 只记录 `error` 对象。**建议**：在开发规范中明确禁止在日志中记录 password、token、完整 request body；对 error 序列化时过滤敏感字段或仅记录 `error.message`。 |

---

## 6. 其他发现

### 6.1 密码重置回调与 locale

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| auth/callback 重定向 | 可用 | **低** | 回调中重定向到 `/reset-password`（无 locale）；中间件会将无 locale 路径重写为 `/{defaultLocale}/reset-password`，功能正常。若希望保留用户语言，可在邮件链接或 cookie 中带上 locale，回调重定向到 `/{locale}/reset-password`。 |

### 6.2 重置密码页最小长度

| 检查项 | 结果 | 风险等级 | 说明与建议 |
|--------|------|----------|------------|
| 与注册一致 | 不一致 | **低** | 注册流程经 `/api/auth/validate-password` 要求更强策略（长度 + 字符类型）；重置密码页仅客户端校验 `password.length < 6` 和一致性与 `minLength={6}`。**建议**：重置密码也调用同一套强度校验（或复用 validate-password），避免弱密码通过重置流程设置。 |

---

## 7. 修复优先级汇总

| 优先级 | 检查点 | 风险等级 | 建议动作 |
|--------|--------|----------|----------|
| P0 | 无 | - | - |
| P1 | 登录/注册/忘记密码页已登录不重定向 | 中 | 在 login/register/forgot-password 页增加「已登录则重定向」 |
| P1 | /api/auth/validate-password 无限流 | 中 | 为该路由增加 AUTH 限流（及可选验证码） |
| P1 | 生产 HTTPS | 中 | 部署层强制 HTTPS 并在文档说明 |
| P2 | 封禁页未登录可访问 | 低 | 封禁页仅对已登录且 banned/suspended 用户展示，否则重定向 |
| P2 | 登录/注册无验证码 | 中 | 增加 reCAPTCHA 或 Supabase Bot 防护 |
| P2 | 登录/操作无自有审计日志 | 中 | 依赖 Supabase 日志或 Hooks/Webhook 同步到自有日志 |
| P3 | 重置密码强度与注册一致 | 低 | 重置密码使用与注册相同的强度校验 |
| P3 | 密码重置回调保留 locale | 低 | 可选：回调重定向带 locale |

---

**审计结论**：认证与账号安全模块整体依赖 Supabase Auth，密码存储与找回链接一次性使用符合安全实践；主要改进点集中在「已登录用户访问 auth 页的重定向」「validate-password 限流」「生产 HTTPS」「可选验证码与封禁页访问控制」及「审计日志与敏感信息规范」。按上表优先级逐项修复即可提升安全性与可审计性。
