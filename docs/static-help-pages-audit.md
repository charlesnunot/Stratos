# 审计任务 25：静态与帮助页面

**目标**：确保静态页面（关于、帮助、隐私政策等）内容准确、安全，权限控制正确，SEO 与多语言显示正常。

**审计日期**：2025-01-31

---

## 1. 页面访问与权限

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 所有用户可访问，无需额外权限 | about、help、privacy 均在 (main) 下，无服务端 redirect 或鉴权；未登录用户也可访问，符合静态页预期。 | 无 | 已满足 |
| 页面不会泄露敏感数据或后端逻辑 | 三页均为纯展示，无 API 密钥、环境变量、内部路径或 SQL；内容来自 i18n 或静态文案。 | 无 | 已满足 |

---

## 2. 内容准确性与多语言

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 页面内容与实际政策一致 | about 使用 about 命名空间；help、privacy 文案为通用说明，与实际政策需业务侧定期核对。 | 低 | 已满足；政策变更时需同步更新 i18n。 |
| 多语言支持正常，切换后显示正确 | **问题**：about 已全量 i18n；**help、privacy 存在硬编码中文**（如「帮助与客服」「常见问题」「隐私政策」「最后更新日期」等），切换英文后仍显示中文。 | **中** | **已修复**：新增 help、privacy 命名空间（en/zh），help 与 privacy 页全部改用 useTranslations('help')/useTranslations('privacy')，无硬编码。 |
| 文本中无乱码或格式错误 | 使用 next-intl + JSON 消息，无手写 HTML 或异常编码。 | 无 | 已满足 |

---

## 3. SEO 与链接

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 页面 meta 标签完整（title、description） | **问题**：about、help、privacy 未单独设置 title/description，仅继承根 layout 的通用 metadata，不利于 SEO 与分享。 | **中** | **已修复**：为 about、help、privacy 各新增 layout.tsx，export generateMetadata，从 next-intl getTranslations 读取 meta.title、meta.description（about/help/privacy 命名空间已增加 meta 字段）。 |
| 内部链接正确，404 错误处理合理 | help 页链接至 /support/tickets/create、/support/tickets，使用 Link from @/i18n/navigation；[locale] layout 非法 locale 时 notFound()。 | 无 | 已满足 |
| 页面可被搜索引擎索引，禁止敏感页面被索引 | 三页为公开静态页，未设置 noindex；敏感页（如 admin、settings）可由后续在对应 layout 或 middleware 中设置 noindex。 | 无 | 已满足 |

---

## 4. 性能与加载

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 页面加载时间合理 | 纯静态 + 客户端 useTranslations，无重数据请求；首屏由 (main) layout 与 Sidebar/TopBar 决定。 | 无 | 已满足 |
| 图片和静态资源优化 | about 仅使用 lucide-react 图标（无外链图）；help、privacy 无图片；根 layout 使用 next/font。 | 无 | 已满足 |
| 异常加载（网络中断、资源缺失）处理正确 | (main)/error.tsx 捕获子段错误并展示通用提示；AbortError 静默；无敏感信息输出到 UI。 | 无 | 已满足 |

---

## 5. 异常处理与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 页面报错是否被捕获 | (main)/error.tsx 为 Error Boundary，捕获渲染错误并 reset；production 下展示「发生错误，请重试」。 | 无 | 已满足 |
| 无敏感信息泄露在控制台或日志中 | error.tsx 仅在生产外调用 console.error(error)，不打印 request/用户数据；静态页无服务端日志。 | 无 | 已满足 |

---

## 修复项汇总

| 项 | 文件 | 说明 |
|----|------|------|
| 1 | `src/app/[locale]/(main)/about/layout.tsx` | 新增；generateMetadata 使用 about.meta.title/description |
| 2 | `src/app/[locale]/(main)/help/layout.tsx` | 新增；generateMetadata 使用 help.meta.title/description |
| 3 | `src/app/[locale]/(main)/privacy/layout.tsx` | 新增；generateMetadata 使用 privacy.meta.title/description |
| 4 | `src/messages/en.json`, `src/messages/zh.json` | about 增加 meta.title、meta.description；新增 help、privacy 命名空间（含 meta 与正文 key） |
| 5 | `src/app/[locale]/(main)/help/page.tsx` | 全部文案改为 useTranslations('help')，链接处用 menu/support |
| 6 | `src/app/[locale]/(main)/privacy/page.tsx` | 全部文案改为 useTranslations('privacy') |

---

## 涉及页面

- **路径**：/main/about、/main/help、/main/privacy（实际 URL 含 locale，如 /en/about、/zh/help）。
- **布局**：(main)/layout.tsx（Sidebar + TopBar + main）；about/help/privacy 下各新增 layout 仅用于 metadata。
