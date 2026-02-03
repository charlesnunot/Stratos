# Admin Actions → System-wide Propagation & Consistency Check

**推演目标**：系统性推演管理员在后台执行关键操作后，前台、数据层、权限层、业务状态是否全量同步、即时生效、不留幽灵状态、支持回滚/追溯。  
**终极通过标准**：任何管理员操作，都不会让系统进入一个「说不清、回不去、修不掉」的状态。

---

## 1️⃣ 内容管理操作

### 管理员：下架帖子 / 恢复帖子 / 驳回或通过内容

**代码路径**：
- 下架/驳回：`POST /api/admin/content-review/[id]/reject`（type: post | product | comment）→ 更新 `status = 'rejected'`（post/comment）或 product `status = 'rejected'`，`reviewed_by` / `reviewed_at`，通知作者，`logAudit`。
- 恢复/通过：`POST /api/admin/content-review/[id]/approve`（type: post | product | comment）→ 更新 `status = 'approved'`（post/comment）或 `'active'`（product），通知作者、触发 AI 翻译等，`logAudit`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| Feed / Topic / Profile / Search 是否同步 | ✅ | 所有列表与 RPC 均按 `status = 'approved'`（post）或 `status = 'active'`（product）过滤；下架后立即从各入口消失，恢复后重新出现 |
| 收藏 / 转发 / 评论如何表现 | ✅ | 收藏：FavoriteItem 拉帖带 status，非 approved 时展示「已下架」占位；评论 RLS 要求 post status=approved；转发为引用关系，原帖下架后直链由 usePostPage 返回 unavailable |
| 直链访问返回什么 | ✅ | usePostPage：非作者且非管理员时，若 `status !== 'approved'` 返回 unavailable；作者本人仍可看 |
| 是否有明确状态提示 | ✅ | 详情页 unavailable 时展示原因；收藏占位为「已下架」 |
| 管理员删除 ≠ 用户删除 | ✅ 一致 | 均为更新 status（rejected），无「只删入口不删引用」；帖子/商品/评论仍存在，仅不可见 |
| 恢复（回滚） | ✅ | approve 允许从 `rejected` 恢复为 approved/active，内容可「复活」 |

### 审计条目（内容管理）

```json
{
  "adminAction": "remove",
  "target": "post",
  "scenario": "管理员驳回/下架帖子 → Feed/Topic/Profile/Search/收藏/直链",
  "affectedSystems": ["frontend", "feed", "permissions"],
  "observedIssue": "无。状态单一来源（posts.status），RLS 与各查询一致过滤，无幽灵引用。",
  "dataIntegrityRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "无",
  "severity": "关键链路"
}
```

```json
{
  "adminAction": "restore",
  "target": "post",
  "scenario": "管理员通过/恢复已驳回帖子",
  "affectedSystems": ["frontend", "feed", "permissions"],
  "observedIssue": "无。approve 支持 rejected→approved/active，状态可回滚。",
  "dataIntegrityRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "无",
  "severity": "关键链路"
}
```

---

## 2️⃣ 用户治理操作（极关键）

### 管理员：封号（ban）

**代码路径**：`POST /api/admin/profiles/[id]/ban` → `profiles.status = 'banned'`，`logAudit`。  
前台生效：middleware 每次鉴权后查 `profiles.status`，若 `banned` 或 `suspended` 则重定向至 `/banned`；发帖/评论/私聊等 API 或 RLS 均校验 `profiles.status = 'active'`。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 是否立即生效（无需刷新） | ✅ | 下次请求即走 middleware 重定向；发帖/评论/消息 API 与 RLS 均按当前 profile 状态校验 |
| 是否影响发帖/评论/私聊/下单支付 | ✅ | RLS：posts/products/comments/likes INSERT 要求 profile.status=active；messages API 校验发送者非 banned/suspended；下单等依赖登录，封号后无法通过 middleware |
| UI 是否有明确反馈 | ✅ | 封号用户被重定向至 banned 页，无法进入主流程 |

### 解封（unban）

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 是否有解封 API | ❌ **缺失** | 仅有 `admin/profiles/[id]/ban`，无 `unban` 或 `status=active` 的更新接口 |
| 能力是否可恢复 | ⚠️ 需绕行 | 目前需直接改库或手动将 profiles.status 置为 active，无标准可追溯的解封流程 |

### 审计条目（用户治理）

```json
{
  "adminAction": "ban",
  "target": "user",
  "scenario": "管理员封号 → 前台发帖/评论/私聊/支付",
  "affectedSystems": ["frontend", "permissions", "chat", "payment"],
  "observedIssue": "无。封号后 middleware 重定向，各 API/RLS 校验 status，无幽灵权限。",
  "dataIntegrityRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "无",
  "severity": "关键链路"
}
```

```json
{
  "adminAction": "unban",
  "target": "user",
  "scenario": "管理员解封用户",
  "affectedSystems": ["frontend", "permissions", "chat", "payment"],
  "observedIssue": "无解封 API。误封后只能通过直接改库或未文档化的方式恢复，无法审计、不可回滚。",
  "dataIntegrityRisk": true,
  "rootCauseGuess": "仅实现了封禁流程，未实现对称的解封流程与审计。",
  "enhancementSuggestion": "新增 POST /api/admin/profiles/[id]/unban（或 PATCH status=active），更新 profiles.status，记录 logAudit(action: 'profile_unban')，确保解封可追溯。",
  "severity": "关键链路"
}
```

---

## 3️⃣ 交易与财务干预

### 管理员：处理退款 / 裁决纠纷

**代码路径**：
- 处理待处理退款：`POST /api/admin/refunds/process` → `processRefund`（含原路/平台垫付）→ 全额退款时调用 `cancel_order_and_restore_stock`（未发货订单恢复库存），更新订单与支付状态，`logAudit`。
- 裁决纠纷：`POST /api/admin/disputes` → 更新纠纷状态，若有退款则创建/复用 order_refunds 并调用 `processRefund`（同上）。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 钱流是否正确 | ✅ | processRefund 统一处理原路/平台垫付；全额退款且未发货时恢复库存，避免「钱退了库存没回」 |
| 订单状态是否同步 | ✅ | processRefund 更新 orders.payment_status / order_status；RPC 更新订单状态与库存 |
| 聊天中是否提示 | ⚠️ 业务层 | 依赖订单状态与通知；无专门「管理员已退款」的聊天内状态条 |
| 用户是否还能继续操作 | ✅ | 订单状态更新后，支付/发货等入口按状态隐藏或禁用 |

### 审计条目（交易/财务）

```json
{
  "adminAction": "refund",
  "target": "order",
  "scenario": "管理员处理退款/裁决纠纷全额退款",
  "affectedSystems": ["payment", "frontend", "permissions"],
  "observedIssue": "无。processRefund 全额退款已统一调用 cancel_order_and_restore_stock（未发货时），钱、订单、库存一致。",
  "dataIntegrityRisk": false,
  "rootCauseGuess": "N/A",
  "enhancementSuggestion": "无",
  "severity": "关键链路"
}
```

---

## 4️⃣ 纠纷 / 工单处理

### 管理员：裁决纠纷、工单关闭/升级

**代码路径**：纠纷裁决见上；工单 `support/tickets/[id]/close`、`update-status`、`assign`、`escalate` 等均有 `logAudit`，更新状态后前台列表与详情按状态展示。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 前台是否锁定相关操作 | ✅ | 纠纷/工单状态更新后，前端按状态展示，不允许重复提交 |
| 双方是否看到一致结果 | ✅ | 数据单一来源（order_disputes / tickets），通知可发双方 |
| 是否可复查裁决依据 | ⚠️ 部分 | 有 logAudit（见下节）；裁决文案存在 resolution 等字段，可追溯内容；审计持久化依赖日志收集 |

---

## 5️⃣ 回滚与逆序推演

| 场景 | 结论 | 说明 |
|------|------|------|
| 误删内容 → 恢复 | ✅ | 内容为 status 更新，approve 可将 rejected 恢复为 approved/active |
| 误封 → 解封 | ❌ **缺 API** | 无 unban 接口，需补全 |
| 误判纠纷 → 撤销裁决 | ⚠️ 业务设计 | 纠纷状态为 resolved 后无「撤销裁决」API；若需撤销需业务设计（如二次纠纷或人工调账） |
| 半恢复状态 | ⚠️ 解封缺位 | 解封缺位时，只能改库，易出现「半恢复」或未记录操作人/时间 |

---

## 6️⃣ 审计与可追溯性

**现状**：
- `logAudit(entry)` 在代码中广泛调用（admin 相关路由约 22+ 处），写入 `action / userId / resourceId / resourceType / result / timestamp / meta`。
- 实现为 `console.log(JSON.stringify(payload))`，**未写入数据库表**。
- `critical_path_logs` 表用于关键路径性能（name, trace_id, outcome, duration_ms），非管理员操作审计。

| 检查点 | 结论 | 说明 |
|--------|------|------|
| 是否有审计记录 | ✅ 有调用 | 关键管理员操作均调用 logAudit |
| 是否持久化 | ❌ 否 | 仅控制台输出，依赖部署侧日志采集（如 Vercel/自建），无 DB 表可查 |
| 是否可关联用户/内容/订单/聊天 | ⚠️ 部分 | meta 可带 resourceId、orderId 等；若日志未持久化到可检索存储，事后复盘能力弱 |

### 审计条目（审计与追溯）

```json
{
  "adminAction": "audit",
  "target": "system",
  "scenario": "管理员操作可追溯性",
  "affectedSystems": ["frontend", "permissions", "feed", "chat", "payment"],
  "observedIssue": "logAudit 仅输出到控制台，未写入 audit_log 表，无法在系统内按操作人/时间/资源检索，存在「说不清」风险。",
  "dataIntegrityRisk": true,
  "rootCauseGuess": "审计设计为日志输出，未与持久化审计表打通。",
  "enhancementSuggestion": "新增 audit_log 表（或复用现有表），logAudit 同时写入 DB（异步/队列可接受），支持按 userId、resourceId、action、时间范围查询；关键操作（ban/unban/refund/dispute）必须可查。",
  "severity": "系统级"
}
```

---

## 通过标准结论

| 维度 | 结论 |
|------|------|
| 内容管理（下架/恢复） | ✅ 状态单一、可回滚、无幽灵引用 |
| 用户封禁 | ✅ 即时生效、全链路校验；❌ **缺解封 API**，存在「回不去」风险 |
| 交易/退款/纠纷 | ✅ 钱、订单、库存一致（含 processRefund 全额退款恢复库存） |
| 审计与追溯 | ⚠️ 有记录、未持久化到 DB，存在「说不清」风险 |

**终极判断**：

在补齐以下两项前，**不能**完全确信「任何管理员操作，都不会让系统进入一个说不清、回不去、修不掉的状态」：

1. **解封能力**：新增 `POST /api/admin/profiles/[id]/unban`（或 PATCH status=active），并记录 `logAudit('profile_unban')`，使误封可回滚、可追溯。
2. **审计持久化**：将 `logAudit` 写入 `audit_log`（或等价）表，或与现有日志管道约定持久化与检索方式，使管理员操作可在系统内按人/时/资源复盘。

完成上述两项后，Stratos 在治理与工程完整性上可达到「平台级产品」的预期：管理员操作可回滚、可追溯、状态一致、无幽灵权限与脏账。
