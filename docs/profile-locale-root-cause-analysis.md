# Profile 页「故事创作者」等英文 URL 下仍显示中文 — 根因分析

## 现象

- 访问 `http://localhost:3000/en/profile/{id}` 时，诊断显示 `useLocale()=en`、`t('storyCreator')="Story creator"`，且 layout 诊断为 `locale=en`、`profile.storyCreator="Story creator"`。
- 页面上「故事创作者」「音乐创作者」「短视频创作者」仍显示为中文。

即：**同一组件内，诊断块为英文，Tab 文案为中文**。

---

## 已排除的原因

### 1. 硬编码

- 全库搜索：除 `src/messages/zh.json` 外，**没有任何地方**硬编码「故事创作者」「音乐创作者」「短视频创作者」。
- 这三处文案只来自 `t('storyCreator')` / `t('musicCreator')` / `t('shortVideoCreator')`。

### 2. 多个 Provider / 嵌套 context

- 全库仅有一处 `NextIntlClientProvider`：`src/app/[locale]/layout.tsx`。
- 根 layout、`(main)` layout 均未再包一层 next-intl Provider。
- 因此不存在「部分子树拿到另一套 locale/messages」的二次注入。

### 3. Layout 的 params 与 messages

- Layout 的 locale 来自 **`params.locale`**（URL 段），对 `/en/...` 为 `en`。
- messages 按 `locale === 'zh' ? zh.json : en.json` 直接加载，**不经过** `getRequestConfig`。
- 诊断已证实 layout 收到 `locale=en` 且 `profile.storyCreator="Story creator"`，故 **layout 传下来的首屏语言应为英文**。

### 4. Middleware 与 requestLocale

- `resolveLocale.js`（next-intl 4.7.0）逻辑：
  - **Prio 1**：路径前缀 → `/en/profile/...` 得到 `locale = 'en'`。
  - **Prio 2/3**：Cookie、Accept-Language 仅在 `!locale && routing.localeDetection` 时使用。
- 当前配置：`localeDetection: false`、`localeCookie: false`，故 **middleware 不会用 cookie/Accept-Language 覆盖路径**。
- Middleware 将解析出的 `locale` 写入请求头 `X-NEXT-INTL-LOCALE`，对 `/en/...` 为 `en`。

### 5. 服务端 Provider 实际使用的值

- 在 **react-server** 上下文中，`next-intl` 导出的是 **NextIntlClientProviderServer**（见 `node_modules/next-intl/dist/esm/development/index.react-server.js`）。
- NextIntlClientProviderServer 逻辑（`NextIntlClientProviderServer.js`）：
  - `locale: locale ?? (await getLocaleCached())`
  - `messages: messages === undefined ? await getMessages() : messages`
- 当前 layout **显式传入** `locale` 与 `messages`，故 **不会** 走 `getLocaleCached()` / `getMessages()`，即 **不会** 使用 `getRequestConfig` 的返回值。
- 因此，**首屏服务端渲染时，Profile 所在子树应使用 layout 传入的 en + en messages**。

### 6. setRequestLocale 与 getRequestConfig

- Layout 在渲染前调用 `setRequestLocale(locale)`（`locale` 来自 `params`），会写入 next-intl 的 `RequestLocaleCache`。
- `getRequestLocale()` = `getCachedRequestLocale() || getLocaleFromHeader()`；对 `/en/...` 两者都应为 `en`（cache 由 layout 设为 en，header 由 middleware 设为 en）。
- 即：即使用到 `getRequestConfig`，其 `requestLocale` 也应为 `en`，**不会** 得到 zh。

---

## 最可能的根因：首屏 HTML 与 hydration 的「来源不一致」

在**不修改代码**的前提下，能同时解释「诊断是英文、Tab 是中文」的只有一种情况：

- **用户看到的 Tab 中文，来自「首屏已有的一份 HTML」**；
- **诊断块显示的英文，来自「当前（客户端）context」**。

即：**首屏 HTML 里那几段 Tab 文案是中文，而当前 React 树（含诊断）是英文**。可能成因有两种。

### A. 首屏 HTML 被缓存（最可能）

- **浏览器或代理/CDN** 缓存了之前某次请求的 HTML（例如之前访问过 `/zh/profile/...` 或某次错误渲染成 zh 的 `/en/profile/...`）。
- 当前请求虽为 `/en/profile/...`，但返回的是**旧 HTML**，其中 Tab 区域已是「故事创作者」等。
- 客户端 JS 加载后，React 使用**当前** Provider 的 en context 做 hydration；**诊断块**是当前树渲染的，故为英文；**Tab 区域**若与缓存的 DOM 在结构上一致，React 可能**复用现有 DOM 节点**而不重写其文本，导致仍显示缓存里的中文。
- **为何 key={locale}、useEffect 同步 creatorLabels 都无效**：若首屏整段 HTML 来自缓存，服务端并未用 en 重新生成该段，hydration 时 React 可能认为「结构一致」而保留原有文本节点，后续 effect 或 key 的更新若未触达这些节点或未触发重挂载，中文就会一直留下。

**建议验证方式（不改业务代码）：**

1. 对 `/en/profile/{id}` 做**硬刷新**（Ctrl+Shift+R / Cmd+Shift+R）或**无缓存访问**（DevTools → Network → Disable cache 后刷新）。
2. 用隐私/无痕窗口首次打开 `http://localhost:3000/en/profile/{id}`，看 Tab 是否仍为中文。
3. 在 DevTools → Elements 里查看 Tab 对应 DOM 的 **outerHTML**，看是否包含「故事创作者」等中文字符；再对比同一页上诊断块 DOM 的文本是否为 "Story creator"。

若在无缓存或隐私窗口下**始终**为英文，则根因可基本确认为 **A. 首屏 HTML 缓存**。

### B. RSC/Streaming 导致「先出的 chunk 用了错误 locale」（理论可能，当前无直接证据）

- 若 Next 在 **streaming** 时先吐出某段 RSC payload（例如包含 Profile 的 chunk），且该 chunk 在**尚未收到 [locale] layout 的 setRequestLocale / Provider 结果**的上下文中执行，则理论上可能用到了**默认或错误的 locale**（例如来自别处缓存的 zh）。
- 当前代码与 next-intl 行为下，**没有**发现会主动给 request 注入 zh 的路径；且 layout 在子节点之前执行，setRequestLocale 会在子组件前执行。因此这只在 Next/next-intl 的极端实现细节下才可能成立。
- 若在**完全无缓存**且**首次访问** `/en/profile/...` 时仍复现，可再考虑排查 RSC/streaming 顺序（例如在 getRequestConfig 与 setRequestLocale 处打日志，看请求生命周期内 requestLocale 与 layout params 的先后与取值）。

---

## 结论（不修改代码下的根因判断）

| 可能原因 | 结论 |
|----------|------|
| 硬编码 | 已排除，无硬编码 |
| 多个/嵌套 Provider | 已排除，仅一处 Provider |
| Layout params / messages 错误 | 已排除，诊断为 en + 英文文案 |
| Middleware 用 cookie/header 覆盖 | 已排除，localeDetection/localeCookie 已关 |
| Provider 用 getRequestConfig 覆盖 | 已排除，layout 显式传 locale+messages |
| requestLocale 为 zh | 已排除，path/cache/header 链均为 en |
| **首屏 HTML 来自缓存，hydration 保留旧 DOM 文本** | **最可能** |
| RSC/streaming 顺序导致错误 locale | 理论可能，需在无缓存下复现后再查 |

**建议下一步**：在**禁用缓存 + 隐私窗口**下访问 `/en/profile/{id}`，观察 Tab 是否仍为中文；并检查 Tab 与诊断块在 DOM 中的实际文本，以确认是否为「首屏 HTML 缓存 + hydration 未重写该段」导致的根因。
