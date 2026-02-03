# 真实用户系统性测试

使用真实账号对需鉴权接口做「登录 → 带 session 请求」的自动化测试。

## 安全要求

- **禁止**将真实密码写入代码或提交到仓库。
- 测试账号凭证只放在 **环境变量** 或 **`.env.test`** 中；`.env.test` 已加入 `.gitignore`。
- 若曾在聊天/文档中暴露过测试密码，建议在 Supabase Auth 中为该账号**修改密码**。

## 配置

1. 复制示例文件（不包含真实密码）：
   ```bash
   cp .env.test.example .env.test
   ```
2. 编辑 `.env.test`，填入你的测试账号：
   ```env
   TEST_USER_EMAIL=jianglei@qq.com
   TEST_USER_PASSWORD=你的密码
   TEST_USER2_EMAIL=kejingshan@qq.com
   TEST_USER2_PASSWORD=你的密码
   TEST_ADMIN_EMAIL=504174115@qq.com
   TEST_ADMIN_PASSWORD=你的密码
   ```
3. 如需在非 development 环境开放测试登录接口，可设：
   ```env
   TEST_MODE=1
   ```

## 运行

1. 启动本地服务：`npm run dev`
2. 在**另一终端**加载 `.env.test` 并执行脚本：
   - **Windows (PowerShell)**：先执行  
     `Get-Content .env.test | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }`  
     再执行 `npm run test:auth:real`
   - **或** 使用 [dotenv-cli](https://www.npmjs.com/package/dotenv-cli)：  
     `npx dotenv -e .env.test -- node scripts/test-auth-with-real-user.js`
   - 也可直接导出变量后运行：  
     `set TEST_USER_EMAIL=... && set TEST_USER_PASSWORD=... && node scripts/test-auth-with-real-user.js`

脚本会：

- 用 `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` 调用 `POST /api/test/session` 登录，拿到 session Cookie；
- 带该 Cookie 请求：
  - `GET /api/settings` — 预期 200 及包含 `profile_visibility`；
  - `GET /api/subscriptions/history` — 预期 200（订阅历史）；
  - `GET /api/payment-accounts` — 预期 200 或 403（非卖家为 403）；
  - `GET /api/deposits/check` — 预期 200 或 403（非卖家为 403）；
- 若配置了 `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`，再以管理员登录并请求：
  - `GET /api/admin/monitoring/dashboard` — 预期 200 及监控数据；
  - `GET /api/admin/platform-payment-accounts` — 预期 200 及 `accounts` 列表。

## 接口说明

- **`POST /api/test/session`**  
  - 仅在 `NODE_ENV=development` 或 `TEST_MODE=1` 时可用；生产环境返回 404。  
  - Body：`{ "email": "string", "password": "string" }`  
  - 成功：200，响应体 `{ ok: true, userId, email }`，并写入 session 的 **Set-Cookie**。  
  - 失败：401（凭证错误）或 400（参数缺失）。

## 扩展

脚本已包含扩展接口：订阅历史、支付账户、保证金检查（普通用户），以及管理员监控与平台支付账户。如需继续增加「登录后调用的接口」，可在 `scripts/test-auth-with-real-user.js` 的 `userGetTests` 或管理员分支中追加路径与断言。
