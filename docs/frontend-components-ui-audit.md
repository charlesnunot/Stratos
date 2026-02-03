# 前端组件库、布局与 UI — 审计报告

**审计范围**：基础 UI 组件、业务组件（社交/电商/支付/布局）、性能与渲染、交互与可用性、国际化、异常与日志  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 基础 UI 组件

**路径**：`src/components/ui/*`（按钮、卡片、对话框、输入、Toast 等）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 组件功能正常（点击、输入、弹窗等） | **通过**：Button 使用 Radix Slot、CVA 变体；Dialog 使用 Radix Dialog；Toast 使用 Radix Toast；Input 为受控 forwardRef；各组件无未捕获异常。 | 通过 | 无。 |
| 样式在不同屏幕尺寸下兼容 | **通过**：Toast 使用 `sm:bottom-0 sm:right-0`、`md:max-w-[420px]`；Dialog 使用 `max-w-lg`、`sm:rounded-lg`；Button/Input 使用 Tailwind 响应式类。 | 通过 | 无。 |
| 可复用性良好，无重复代码 | **通过**：UI 组件为纯展示/受控，无业务逻辑重复；业务组件复用 UI 组件。 | 通过 | 无。 |
| 无隐藏报错或未捕获异常 | **通过**：Toaster 与 useToast 无 throw；Dialog/Button 为包装 Radix，异常由 Radix 处理。 | 通过 | 无。 |
| 无障碍与 i18n | **部分**：Dialog 关闭按钮使用 `<span className="sr-only">Close</span>`，硬编码英文，未使用多语言。EmptyState 默认 title 为「暂无内容」，硬编码中文。 | **低** | Dialog 关闭 sr-only 使用 useTranslations('common') 的 close；EmptyState 默认 title 使用 t('noContent')。 |

---

## 2. 业务组件

**社交**：`components/social/*`；**电商**：`components/ecommerce/*`；**支付**：`components/payments/*`；**布局**：`components/layout/*`。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 组件功能与对应业务流程一致 | **通过**：PostCard/ProductCard 与帖子/商品流程一致；ShoppingCart、PaymentMethodSelector 与下单/支付流程一致；Sidebar/TopBar 与导航一致。 | 通过 | 无。 |
| 数据显示正确，状态更新同步 | **通过**：业务组件使用 React Query 或 store（cartStore）；PostCard/ProductCard 接收服务端或查询数据，状态与后端一致。 | 通过 | 无。 |
| 组件依赖和 props 校验正确 | **通过**：ProductCard/PostCard 有明确 TypeScript 类型；ProductCardView/PostCardView 接收 DTO/state/actions。 | 通过 | 无。 |
| 相对时间与侧栏文案未 i18n | **部分**：PostCard、PostCardView 内 formatPostDate 返回「刚刚」「X分钟前」等硬编码中文；Sidebar 内 formatLastSeen 返回「刚刚上线」「昨天」「从未上线」等硬编码中文。 | **低** | 在 common 中增加 timeJustNow、timeMinutesAgo、timeHoursAgo、timeDaysAgo、timeJustNowOnline、yesterday、timeNeverOnline，formatPostDate/formatLastSeen 使用 t() 输出。 |

---

## 3. 性能与渲染

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 列表（帖子、商品）渲染性能 | **通过**：MasonryGrid 使用 react-masonry-css；PostCard/ProductCard 使用 memo 或稳定 props；列表由父组件分页/无限滚动控制。 | 通过 | 无。 |
| 图片懒加载、分页/瀑布流 | **通过**：Next/Image 自带懒加载；MasonryGrid 提供瀑布流布局；首页/动态流由页面级分页或 limit 控制。 | 通过 | 无。 |
| 组件渲染异常是否有 fallback | **部分**：MasonryGrid 对 children 仅做 map 包装，单个 child 抛错会导致整列表崩溃；PostCard 有 imageError 状态避免图片挂掉。页面级有 Error Boundary。 | **低** | 可选：对列表项使用 Error Boundary 或 try/catch 包裹单卡渲染，失败时渲染占位卡。 |

---

## 4. 交互与可用性

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 按钮、输入、Toast、Modal 交互一致 | **通过**：Button 变体统一；Toast 通过 useToast/toast() 统一调用；Dialog 使用 Radix 一致行为；Input 样式统一。 | 通过 | 无。 |
| 动画/提示是否不影响核心流程 | **通过**：Toast 自动关闭、可手动关闭；Dialog 可关闭；无阻塞式动画。 | 通过 | 无。 |
| 错误提示信息清晰 | **通过**：业务组件使用 showError/showSuccess（toast）或 t() 文案；API 错误通过 handleApiError 返回 userMessage。 | 通过 | 无。 |

---

## 5. 国际化支持

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| UI 文本是否支持多语言（i18n） | **部分**：多数业务组件已使用 useTranslations；EmptyState 默认「暂无内容」、Dialog 关闭「Close」、PostCard/PostCardView/Sidebar 相对时间文案为硬编码，未走 i18n。 | **低** | 见 1.1、2.1：EmptyState 使用 t('noContent')；Dialog 使用 t('close')；相对时间使用 common 新键。 |
| 组件在不同语言下显示正常 | **通过**：next-intl 按 locale 加载 messages；RTL 由 LocaleScript 设置 dir；语言切换后 pathname 保持，内容由 t() 更新。 | 通过 | 无。 |

---

## 6. 异常与日志

### 6.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 前端异常是否被捕获并可追踪 | **通过**：Error Boundary 捕获渲染异常；Sidebar 中 getUser 的 promise 有 .catch 并过滤 AbortError；API 调用处多有 try/catch 或 mutation onError。 | 通过 | 无。 |
| 无未处理的 Promise 或报错信息泄露 | **通过**：关键异步链有 catch；Error Boundary 生产环境不展示原始 error.message（见基础设施审计）。 | 通过 | 无。 |

---

## 7. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | EmptyState 默认 title 硬编码 | 默认「暂无内容」未 i18n | **低** | 使用 useTranslations('common')，默认 title 为 t('noContent') |
| 2 | Dialog 关闭 sr-only 硬编码 | 「Close」未 i18n | **低** | 使用 useTranslations('common')，sr-only 为 t('close') |
| 3 | 相对时间文案硬编码 | PostCard/PostCardView/Sidebar 相对时间为中文硬编码 | **低** | common 增加 timeJustNow 等键，formatPostDate/formatLastSeen 使用 t() |
| 4 | 列表项渲染无单卡 fallback | 单卡抛错可能导致整列表崩溃 | **低** | 可选：单卡 Error Boundary 或 try/catch 占位 |

---

## 8. 已采用的正确实践（无需修改）

- **基础 UI**：Radix 无障碍、CVA 变体、forwardRef；Toast/Dialog 行为一致。
- **业务组件**：TypeScript 类型清晰、使用 useTranslations、Next/Image、cartStore/React Query。
- **布局**：MasonryGrid 响应式列数；Sidebar 中 promise 有 catch 与 AbortError 过滤。
- **错误**：Error Boundary、生产环境不展示原始 message；API 使用 userMessage。

---

## 9. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | EmptyState 默认 title | **已修复**：EmptyState 使用 useTranslations('common')，默认 title 为 t('noContent')。 |
| 2 | Dialog 关闭 sr-only | **已修复**：DialogContent 内使用 useTranslations('common')，sr-only 文案为 t('close')。 |
| 3 | 相对时间 i18n | **已修复**：common 增加 timeJustNow、timeMinutesAgo、timeHoursAgo、timeDaysAgo、timeJustNowOnline、yesterday、timeNeverOnline；PostCard、PostCardView、Sidebar 中 formatPostDate/formatLastSeen 改为使用 t() 输出。 |

---

**审计结论**：组件库与布局在功能、性能、交互和异常处理方面整体良好；**主要改进点**为 **EmptyState/Dialog/相对时间文案的 i18n 统一**（低）。建议按上表完成修复，列表项 fallback 可按需增加。
