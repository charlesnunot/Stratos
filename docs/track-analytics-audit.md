# 追踪与分析模块（Track & Analytics）— 审计报告

**审计范围**：用户行为追踪、关键路径分析、日志记录、隐私与安全、性能与报表  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议；已修复项已落地。

---

## 1. 追踪事件与数据完整性

**页面与接口**：`/api/track/view`、`/api/track/critical-path`；前端 `useTrackView`、`critical-fetch`。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 浏览、点击、互动事件是否正确记录 | **通过**：`/api/track/view` 校验 `entityType`（post/product/profile）、`entityId`（UUID），仅对已存在且可展示的实体写入 `view_events`（entity_type、entity_id、viewer_id、session_id、owner_id、viewed_at）；`useTrackView` 在帖子/商品/个人主页挂载时各调用一次，同一页面重复进入会重复计数（PV）。 | 通过 | 无。 |
| 数据与前端显示、用户操作一致 | **通过**：埋点仅记录 entityType + entityId，与页面展示实体一致；未记录敏感内容；session 由 cookie `track_sid` 持久化，同端访问可区分 UV。 | 通过 | 无。 |
| 多端访问时追踪事件是否同步 | **通过**：未登录用户以 `session_id`（cookie）区分；登录用户以 `viewer_id` 区分；多端不同 session_id，统计上为多 UV，符合预期。 | 通过 | 无。 |

---

## 2. 用户隐私保护

**涉及**：track/view 请求体与存储、critical-path 日志、view_events 表访问。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 追踪数据中是否包含敏感信息 | **通过**：track/view 仅接收并存储 entityType、entityId；不记录密码、支付信息、私信内容；view_events 存 viewer_id、session_id、owner_id、viewed_at，无内容原文。 | 通过 | 无。 |
| 用户匿名化或去标识化处理 | **通过**：未登录用户仅存 session_id（UUID），无直接身份；登录用户存 viewer_id 用于归属统计，需通过 RLS/权限控制访问。 | 通过 | 无。 |
| 日志访问权限是否严格控制 | **通过**：critical-path 仅写 server log，不落库；view_events 需依赖 Supabase RLS 与后台权限；API 无对外“查询原始追踪日志”的开放接口。 | 通过 | 建议：后台若需查 view_events，仅限 admin 且审计访问。 |

---

## 3. 性能与稳定性

**涉及**：/api/track/view、/api/track/critical-path 的限流与异常处理。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 追踪接口是否对高频操作有限流或批量处理 | **已修复**：原无限流，存在刷量风险。已为 `/api/track/view` 增加速率限制：`RateLimitConfigs.TRACK_VIEW`（120 次/分钟/IP 或用户），通过 `withApiLogging(..., { rateLimitConfig: RateLimitConfigs.TRACK_VIEW })` 实现。 | ~~中~~ 已修复 | 无。 |
| 异常请求或失败是否有回退 | **通过**：track/view 校验失败返回 400/404，插入失败返回 500，不抛未捕获异常；前端 `useTrackView` 中 `fetch(...).catch(() => {})` 静默失败，不阻塞页面。critical-path 仅打日志并返回 200，不阻塞用户路径。 | 通过 | 无。 |

---

## 4. 日志与监控

**涉及**：critical-path 日志、API 日志（withApiLogging）、view_events 表。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 日志是否记录事件来源、时间、用户 ID（脱敏） | **通过**：critical-path 记录 name、traceId、outcome、durationMs、metaKeys（仅 key 列表，不记录 meta 原文，见基础设施审计已修复）；withApiLogging 记录 path、userId、statusCode、duration、requestId、ip。 | 通过 | 无。 |
| 是否可追踪关键事件和异常操作 | **通过**：view_events 可查浏览序列；critical-path 可查关键路径耗时与结果；API 429/500 等有 requestId 与日志，便于排查。 | 通过 | 无。 |

---

## 5. 数据分析与报表

**涉及**：基于 view_events、critical-path 的统计与报表（若存在）。

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 分析报表是否基于完整且准确的数据 | **通过**：view_events 写入前校验实体存在且可展示，数据与真实曝光一致；限流后单 IP/用户 120 次/分钟，可抑制刷量，报表更可信。 | 通过 | 无。 |
| 异常数据是否被合理过滤 | **通过**：非法 entityType/entityId 直接 400/404 不落库；未找到 owner 不插入；无“脏数据”写入。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 状态 |
|------|--------|----------|----------|------|
| 1 | /api/track/view 无速率限制 | 可被恶意刷量，影响统计与负载 | ~~中~~ | **已修复**：增加 TRACK_VIEW 限流 120/分钟/IP 或用户 |
| 2 | critical-path 记录 meta 原文 | body.meta 原样写入日志可能含 PII | ~~低~~ | **已在基础设施审计中修复**：仅记录 metaKeys |

---

## 7. 已实施的修复

1. **`src/lib/api/rate-limit.ts`**  
   - 新增 `RateLimitConfigs.TRACK_VIEW`：`maxRequests: 120`，`windowMs: 60 * 1000`。

2. **`src/app/api/track/view/route.ts`**  
   - 将原 `POST` 逻辑提取为 `trackViewHandler`。  
   - `export const POST = withApiLogging(trackViewHandler, { rateLimitConfig: RateLimitConfigs.TRACK_VIEW })`。  
   - 超限返回 429，带 `X-RateLimit-*` 与 `Retry-After`。

---

## 8. 可选后续优化

- 后台查询 view_events 时：仅限 admin，并对访问做审计（如 logAudit）。  
- 若需跨实例限流：可将当前内存限流替换为 Redis/Supabase 等分布式限流。  
- 关键路径数据若需长期分析：可增加落库或对接 Sentry/Datadog 等，并保持仅记录非 PII 字段。
