# common.timeDaysAgo 显示修复实施计划

## 问题描述

**现象**：访问 `http://localhost:3000/en` 时，页面仍显示 `common.timeDaysAgo` 而非翻译后的文本（如 "3 days ago"）。

**预期**：应显示如 "3 days ago" 或 "3 day(s) ago" 等正确翻译。

---

## 根因分析

### 可能原因

1. **ICU 插值格式**：当前使用 `"{count} day(s) ago"`，部分 next-intl/ICU 实现对简单插值处理异常，可能导致回退到显示 key。
2. **Plural 语法**：next-intl 推荐对数量类文案使用 ICU plural 语法，简单 `{count}` 在某些场景可能解析失败。
3. **构建缓存**：`.next` 缓存可能导致旧的 messages 被使用。
4. **占位符名称**：极少数情况下变量名或格式不符合库的期望。

### 涉及位置

| 组件 | 函数 | 使用的 key | 翻译命名空间 |
|------|------|------------|--------------|
| Sidebar | formatLastSeen | timeDaysAgo | common |
| PostCard | formatPostDate | timeDaysAgo | common |
| PostCardView | formatPostDate | timeDaysAgo | common |

### 当前 en.json 配置

```json
"timeDaysAgo": "{count} day(s) ago"
```

---

## 修复方案

### 方案 A：改用 ICU plural 语法（推荐）

next-intl 官方推荐使用 ICU plural 处理数量文案，可避免插值解析问题：

**en.json**：
```json
"timeDaysAgo": "{count, plural, one {# day ago} other {# days ago}}"
```

**zh.json**：
```json
"timeDaysAgo": "{count, plural, other {# 天前}}"
```

说明：`#` 为 count 的占位符，`one`/`other` 为复数形式。

### 方案 B：保持简单格式并排查缓存

若希望保留 `"{count} day(s) ago"`：

1. 确认 key 拼写无误（`timeDaysAgo`）。
2. 清除构建缓存并重启：
   ```bash
   rm -rf .next
   npm run dev
   ```
3. 若仍异常，可尝试改为 `"{count} days ago"`，排除 `day(s)` 中括号对解析的影响。

### 方案 C：同时修复其他 time* 键（可选）

为保持风格统一，可将 `timeMinutesAgo`、`timeHoursAgo` 一并改为 plural：

**en.json**：
```json
"timeMinutesAgo": "{count, plural, one {# min ago} other {# min ago}}",
"timeHoursAgo": "{count, plural, one {# hr ago} other {# hr ago}}",
"timeDaysAgo": "{count, plural, one {# day ago} other {# days ago}}"
```

---

## 实施步骤

### 步骤 1：修改 en.json

在 `src/messages/en.json` 的 `common` 中，将 `timeDaysAgo` 改为：

```json
"timeDaysAgo": "{count, plural, one {# day ago} other {# days ago}}"
```

### 步骤 2：修改 zh.json

在 `src/messages/zh.json` 的 `common` 中，将 `timeDaysAgo` 改为：

```json
"timeDaysAgo": "{count, plural, other {# 天前}}"
```

### 步骤 3：清除缓存并验证

```bash
# Windows PowerShell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

访问 `http://localhost:3000/en`，检查：

- Sidebar 中「最后上线」时间
- 帖子卡片上的发布时间

应显示正常翻译，而非 `common.timeDaysAgo`。

### 步骤 4：若仍异常，再排查

1. 检查 layout 是否正确加载 messages（`src/app/[locale]/layout.tsx`）。
2. 确认 `NextIntlClientProvider` 接收的 `messages` 包含最新 `common` 内容。
3. 在浏览器中查看是否仍有多处 key 未解析。

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| src/messages/en.json | common.timeDaysAgo 改用 ICU plural |
| src/messages/zh.json | common.timeDaysAgo 改用 ICU plural |

---

## 验证要点

1. 英文环境：显示 "1 day ago"、"3 days ago"。
2. 中文环境：显示 "1 天前"、"3 天前"。
3. Sidebar、PostCard、PostCardView 中相关时间展示均正常。
4. 不再出现 `common.timeDaysAgo` 字面量。
