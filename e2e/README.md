# E2E 检查（Playwright）

用于本地对 http://localhost:3000/en 等页面做自动化检查，对应上线清单核心链路与 UI 快速检查。

## 使用步骤

1. **安装依赖**（若尚未安装）  
   ```bash
   npm install
   npx playwright install
   ```

2. **启动开发服务器**（另开一个终端）  
   ```bash
   npm run dev
   ```
   确认 http://localhost:3000/en 可访问。

3. **运行检查**  
   ```bash
   npm run test:e2e
   ```
   或带 UI：`npm run test:e2e:ui`

## 当前用例

- **check-en.spec.ts**：/en 首页 — GET 200、main 非空、导航存在、无严重 console 错误。
- **auth.spec.ts**：登录/注册 — /en/login、/zh/login、/en/forgot-password 可访问，登录页有表单。

更多测试项见 [stratos-test-script-checklist](../docs/stratos-test-script-checklist.md)。

## 配置

- `playwright.config.ts`：baseURL 为 `http://localhost:3000`，超时 30s。
