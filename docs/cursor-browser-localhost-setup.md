# Cursor 浏览器访问 localhost:3000 设置说明

要让 Cursor Agent 能在浏览器里打开并测试你本机的 **http://localhost:3000**，需要解决两点：

1. **浏览器 MCP 可用**（Agent 能调 browser_navigate、browser_tabs 等）
2. **允许访问 localhost**（浏览器运行在你本机，本身就能访问 localhost；企业版需配置 Origin 白名单）

---

## 一、启用 Cursor 内置浏览器（优先）

Cursor 自带 Browser 能力，**无需单独装 MCP** 即可用。

1. 打开 **Cursor 设置**（`Ctrl + ,`）
2. 进入 **Tools & MCP** → **Browser Automation**
3. 确认 **Browser Automation** 已开启
4. 选择浏览器模式：
   - **Chrome**：单独 Chrome 窗口，适合全屏测试
   - **Browser Tab**：在 Cursor 内嵌标签页

浏览器进程跑在你本机，访问 **http://localhost:3000** 没有问题。

---

## 二、企业版：把 localhost 加入 Origin 白名单

若你用的是 **Cursor 企业版**，且启用了「Browser Origin Allowlist」：

1. 打开 [Settings Dashboard](https://cursor.com/dashboard?tab=settings) → **MCP Configuration**
2. 确认 **Enable Browser Automation Features (v2.0+)** 已开启
3. 在 **Browser Origin Allowlist (v2.1+)** 中点击 **Add Origin**
4. 添加：`http://localhost:3000`（或 `http://localhost:*` 若支持通配）

否则 Agent 的 `browser_navigate` 可能无法自动打开 localhost。

---

## 三、可选：第三方 Browser MCP（browsermcp）

若内置浏览器不可用或你想用第三方 MCP，本项目已配置 **browsermcp**：

- 配置文件：**`.cursor/mcp.json`**（项目级，仅对本项目生效）
- 需要 **Node.js**，首次会执行 `npx -y @browsermcp/mcp@latest`

**额外步骤**（browsermcp 要求）：

1. 在 Chrome 安装 [Browser MCP 扩展](https://chromewebstore.google.com/detail/browser-mcp-automate-your/bjfgambnhccakkhmkepdoekmckoijdlc)
2. 在 Cursor 里启动/刷新 MCP 后，在扩展里点击 **Connect**，把浏览器和 MCP 连起来

完成后 Agent 即可通过该 MCP 控制浏览器，访问 localhost:3000。

---

## 四、为何 localhost 可以访问？

- **浏览器 MCP** 是在**你本机**起的进程（Cursor 内置或 npx 起的 browsermcp），控制的浏览器也在本机。
- 因此打开 `http://localhost:3000` 和你在地址栏输入一样，**没有「隔离环境」限制**。
- 之前说的「localhost 无法访问」指的是 **mcp_web_fetch** 等跑在远程/隔离环境的工具，**不适用于本机浏览器 MCP**。

---

## 五、自检

1. 先在本机跑起应用：`npm run dev`，确认 http://localhost:3000 可访问。
2. 在 Cursor 对话里让 Agent：「请用浏览器打开 http://localhost:3000 并截一张首页截图。」
3. 若内置 Browser 已开启且（企业版）已加白名单，应能正常打开并截图；若不行，再按第三节检查 browsermcp 与扩展连接。
