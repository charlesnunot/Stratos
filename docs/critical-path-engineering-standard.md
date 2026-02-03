# Critical Path Engineering Standard（成交关键路径 10 秒内必达）

本文是平台级工程规范，用于制度化保证 **成交关键路径（Critical User Path / Revenue Path）在 10 秒内必达**：即 **10 秒内必须给用户“成功跳转”或“明确可理解的失败/超时反馈”**，禁止无限等待与无状态转圈。

> 适用范围：Message seller / 建会话、Buy Now / Checkout、Login、Pay 等所有关键路径。

---

## 1. 术语与目标

### 1.1 关键路径（CUP）
满足任一条件即纳入关键路径治理：
- 直接影响成交/营收（Buy Now、Checkout、Pay）
- 直接影响转化漏斗核心动作（Message seller、Login）
- 影响用户关键任务完成（发布、下单确认等）

### 1.2 “10 秒内必达”的定义
- **必达**：从用户点击（或触发）到页面/流程进入“可继续状态”的耗时。
- **可继续状态**：用户已进入目标页或获得可操作的下一步（例如拿到 `conversationId` 并进入聊天页；进入 checkout skeleton 并继续校验）。
- **封顶**：在 SLA 内未完成则视为 **Timeout（超时）**，必须提示用户“超时请重试”，不得用“失败”泛化。

---

## 2. 行业铁律（写入规范的强制条款）

### 2.1 铁律 1：关键路径必须“时间封顶”
- **强制**：前端必须对关键路径请求设置超时（推荐 8s），保证 10s 内完成“跳转 or 超时反馈”。
- **约束**：超时是系统未在 SLA 内响应，不等于业务失败。
- **用户文案**：统一为「验证/打开超时，请重试」类，禁止使用「操作失败」泛化。

### 2.2 铁律 2：关键路径必须“最短调用链”
- **强制**：关键路径的服务端逻辑必须收口为 **一次权威判断**（1 个 API 或 1 个 RPC）。
- **禁止**：
  - 前端为 RPC 额外调用 `getSession()/getUser()` 再调用 RPC（双往返）。
  - 在关键路径中串行拼装多个 API/RPC 才能决定是否可继续。
- **推荐**：依赖 cookie + `auth.uid()`（或等价机制）完成鉴权与 RLS 判定。

### 2.3 铁律 3：关键路径不追求“完美完成”，只追求“可继续”
- **允许**：先进入页面（skeleton/空态），再补齐数据（延迟加载）。
- **目标**：用户 10s 内能继续，不被卡在门口。

### 2.4 铁律 4：关键路径必须“有状态反馈”
- **禁止**：单一 spinner 转圈超过 2–3s 且无语义提示。
- **强制**：关键路径交互必须采用状态机并显示语义文案：
  - Idle → Pending（正在为你打开…/正在验证…）→ Redirecting → Success
  - Timeout / Failed（给出可重试动作）

---

## 3. SLO / SLA 与预算（Budget）

### 3.1 默认 SLA
| 场景 | 默认 SLA（端到端） | 前端请求超时建议 |
|---|---:|---:|
| 私聊/建会话 | ≤ 10s | 8s |
| Buy Now / Checkout | ≤ 10s | 8s |
| 支付跳转 | ≤ 5s | 4s |
| 登录/授权 | ≤ 5s | 4s |

### 3.2 SLO（建议）
- **P95 ≤ 10s**，并关注 **P99**（尾延迟是体感慢的主要来源）。
- 设定 **Timeout rate**、**Fail rate** 阈值（按业务分层定义）。

---

## 4. 代码层强制执行（本仓库落地约定）

### 4.1 统一关键路径请求封装（强制）
- 所有关键路径的网络请求必须通过统一封装（见 `src/lib/critical-path/critical-fetch.ts`）：
  - **统一超时**
  - **统一 traceId**
  - **统一 outcome 记录（成功/失败/超时/取消）**

### 4.2 统一埋点（最低可用实现）
- 关键路径每次触发必须记录一次事件：
  - `name`：关键路径名称（例如 `message_seller_open_chat`、`buy_now_validate_product`）
  - `durationMs`：耗时
  - `outcome`：`success | timeout | failed | aborted`
  - `traceId`：一次用户动作链路 ID（同一次动作内保持一致）

> 本仓库当前落地为 `POST /api/track/critical-path`（服务端可替换为更完善的监控/数据仓库）。

---

## 5. 发布治理（Performance Gate）

### 5.1 PR/CR 检查清单（关键路径改动必填）
- 是否新增网络往返？（新增一跳即风险）
- 是否仍保持“一次权威判断”？（1 API/RPC）
- 是否包含前端超时（8s）与明确超时文案？
- 是否实现状态机与可重试动作？
- 是否添加/更新关键路径埋点（duration/outcome/traceId）？

### 5.2 灰度与回滚
- 关键路径在灰度期间必须观察：
  - P95/P99 latency、timeout rate、fail rate
- 指标恶化触发降级/回滚（按团队发布策略执行）。

---

## 6. 责任制（DRI / Owner）
- 每条关键路径必须指定 Owner（DRI），对 SLO 负责。
- 一旦 Error Budget 被耗尽，优先级切换为性能/稳定性修复，暂停非关键功能变更。

---

## 7. 当前示范实现（落地样板）
- Message seller：`useConversation.getOrCreateConversation()`（RPC + 8s 超时 + 埋点）
- Buy Now：`useProductDetailActions.buyNow()`（validate-product API + 8s 超时 + 埋点）

