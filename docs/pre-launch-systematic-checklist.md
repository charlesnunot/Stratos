# Stratos 上线前系统性工作清单

**核心目标**：上线后系统可控、关键链路可靠、用户体验不炸、钱和权限零容忍  
**适用**：首次正式上线 / 重大版本上线  
**执行顺序**：按 1→10 逐项落实；Gate 不通过禁止上线。

---

## 1️⃣ 核心链路推演（必须）

**目的**：确保核心业务流程在正常与异常情况下都能安全跑通。

### 必跑通的 6 条链路

| # | 链路 | 要求 | 衔接文档 |
|---|------|------|----------|
| 1 | 游客 → 登录 → 使用系统 | 未登录拦截、登录成功、redirect 正确、进入主站 | [pre-launch-intent-runthrough-checklist](pre-launch-intent-runthrough-checklist.md) 1.1、1.3 |
| 2 | 登录 → 社交互动（发帖/点赞/关注） | 发帖成功、关注/取消关注、列表/详情可见 | 意图清单 2.3/2.4、3.1；[pre-launch-runthrough-results](pre-launch-runthrough-results.md) |
| 3 | Message seller → 会话 → 聊天 | 联系卖家建会话、跳转聊天页、可发消息 | 意图清单 4.1/4.2/4.5 |
| 4 | 聊天 → Buy Now → 下单 | 从聊天/商品页 Buy Now、结账页、创建订单成功 | 意图清单 5.5、6.1 |
| 5 | 下单 → 支付 → Webhook → 权限/状态更新 | 支付完成、Webhook 处理、订单/订阅状态正确 | 意图清单 6.3～6.6 |
| 6 | 订阅 → 权益生效/取消 | 订阅支付、权益生效（如卖家中心）；取消后到期失效 | 意图清单 7.1、7.4、7.6 |

**重点**：

- 核心链路成功率 **100%**（不白屏、不卡死、不靠手修数据）
- 并发/异常/网络抖动场景均覆盖（见 Gate 2）
- 幂等性和可重试（防重复提交、Webhook 按 provider_ref 幂等）

**执行**：在 **staging** 按 [pre-launch-runthrough-results.md#gate-1-六条链路](pre-launch-runthrough-results.md#gate-1-六条链路staging-手工执行) 填写「手工结果」「执行人」「执行日期」。

---

## 2️⃣ 上线 Gate 检查（必做）

**Gate 是上线前的“闸门”，不通过绝对不能上线。**

| Gate | 内容 | 验证结果 | 衔接 |
|------|------|----------|------|
| Gate 0 | 发布前置条件（环境变量、RLS、Webhook 生产地址、回滚方式） | 见下方执行结果 | [pre-launch-production-release-gate](pre-launch-production-release-gate.md#gate-0发布前置条件不满足直接停) |
| Gate 1 | 核心链路可跑通（上述 6 条） | 代码通过；staging 手工必填 | [pre-launch-production-release-gate](pre-launch-production-release-gate.md#gate-1核心链路可跑通blocking) |
| Gate 2 | 异常条件下不破坏系统（重复点击、刷新/关闭、网络失败、Webhook 延迟/重复、Realtime 断线） | 代码通过 | [pre-launch-production-release-gate](pre-launch-production-release-gate.md#gate-2异常情况下不破坏系统最关键) |
| Gate 3 | 钱/权限零容忍（Webhook 幂等、前端失败≠支付失败、拉黑/封禁生效、非本人不可操作、前后端双重校验） | 代码通过 | [pre-launch-production-release-gate](pre-launch-production-release-gate.md#gate-3钱--权限零容忍absolute-blocker) |
| Gate 4 | 非核心功能允许降级（有边界：失败有提示、不阻塞主链路、不写半成品数据） | 已落实 | [pre-launch-production-release-gate](pre-launch-production-release-gate.md#gate-4非核心功能允许降级有边界) |
| Gate 5 | 最低可观测性（支付/订单/订阅/消息有日志、可定位 user_id+行为、钱可追溯） | 已落实 | [pre-launch-production-release-gate](pre-launch-production-release-gate.md#gate-5可观测性最低保障上线后能救) |

**执行结果**：详见 [pre-launch-production-release-gate.md#执行结果](pre-launch-production-release-gate.md#执行结果代码文档验证)。

---

## 3️⃣ UI 快速检查（系统性、非全面）

**目标**：确保 UI 不误导、不阻塞、不掩盖系统状态。

| 类别 | 检查点 | 验证 |
|------|--------|------|
| 核心按钮 | Message seller / Buy Now / Send message / Subscribe：loading、防重复点击、错误提示 | [pre-launch-ui-quick-checklist](pre-launch-ui-quick-checklist.md) 一 |
| 权限相关 | 被拉黑：Message seller 隐藏或禁用；非卖家：编辑/下架隐藏；未订阅：提示不报错 | 同上 二 |
| 异常状态 | 网络失败、API 错误、空数据、会话不存在、商品下架：不白屏、有兜底文案 | 同上 三 |
| 状态变化 | 未读数、订阅生效、支付完成、登录/登出：UI 及时反映 | 同上 四 |
| 跳转 | Message seller→聊天页、Buy Now→结账、支付完成→回站：不中断 | 同上 五 |

**红线**：所有核心动作有 loading+错误反馈；权限按钮不误导；任意异常不白屏不卡死；核心跳转不中断。

---

## 4️⃣ 权限与安全检查

| 项 | 要求 | 代码/文档验证 |
|----|------|----------------|
| 访问控制 | 未登录、被拉黑、非卖家、未订阅状态正确拦截 | middleware banned/suspended→/banned；useAuthGuard/useSellerGuard；messages API 校验 blocked_users |
| RLS / API | 业务表 RLS 开启；写操作 API 必校验 user，订单/支付/资料按 buyer_id/seller_id/user_id | [pre-launch-config-checklist](pre-launch-config-checklist.md) 七；orders/*/cancel|ship|confirm-receipt|dispute 等均 getUser+本人校验 |
| 双重保护 | 前端显隐 + 后端再校验 | useAuthGuard/useSellerGuard + API getUser() |
| 敏感操作 | 订单、支付、订阅、消息：仅本人或有权角色可操作 | 订单 API 校验 order.buyer_id/order.seller_id；支付/订阅以 Webhook+DB 为准 |

**执行**：RLS 在目标生产库按配置检查表「七、业务表 RLS 确认」逐表核对。

---

## 5️⃣ 数据与 DB 检查

| 项 | 要求 | 验证 |
|----|------|------|
| 核心表与迁移 | 生产库迁移脚本与代码一致，按 `supabase/migrations/` 顺序执行 | [pre-launch-config-checklist](pre-launch-config-checklist.md) 二 |
| 唯一/幂等约束 | 订单 order_number UNIQUE；payment_transactions (provider, provider_ref) UNIQUE；会话 (participant1_id, participant2_id, conversation_type) UNIQUE | 迁移 001、104、001；104 显式 idx_payment_transactions_provider_ref |
| 脏数据/半成品 | 创建会话+成员在同一事务（get_or_create_private_conversation RPC）；支付以 Webhook+provider_ref 幂等，不重复入账 | 推演 4.4、6.5/6.6 |
| 回滚/灾备 | 回滚步骤、迁移回滚、支付补救、Cron 补跑 | [production-runbook](production-runbook.md) |

**执行**：上线前在目标库执行配置检查表「二、数据库迁移」并记录最后迁移文件名；Runbook 回滚章节已阅读并认可。

---

## 6️⃣ 集成与第三方服务检查

| 服务 | 检查点 | 说明 |
|------|--------|------|
| 支付（Stripe / PayPal / 微信 / 支付宝） | Webhook URL 生产、密钥生产；回调幂等（provider_ref）；失败/延迟可重试、对账流程 | [production-runbook](production-runbook.md) 支付成功但订单未更新；[pre-launch-config-checklist](pre-launch-config-checklist.md) 至少一种支付 |
| Webhook 与后台同步 | 同一 provider_ref 多次回调只处理一次，return 200 | Stripe/Alipay/WeChat/PayPal 均按 provider_ref 查 payment_transactions |
| Realtime / 消息推送 | 断线重连、消息去重（appendMessageDeduped） | 推演 4.10、8.4 |
| Cron / 定时任务 | CRON_SECRET 配置、cron_logs 写入、失败可补跑 | verifyCronSecret；各 Cron 写 cron_logs；Runbook Cron 补跑 |
| CDN / 文件存储 / 图片 | 上传与访问策略（RLS）；无生产硬编码 | storage RLS 见迁移 007、012 等 |

**异常模拟**：Webhook 重复→幂等；网络失败→criticalFetch 超时提示、可重试。Runbook 覆盖对账与 resend。

---

## 7️⃣ 性能与压力检查（必要最小覆盖）

| 项 | 要求 | 说明 |
|----|------|------|
| 核心链路响应 | 结账/下单 criticalFetch 8s、支付页 4s；超时提示「验证超时，请重试」 | [critical-path](src/lib/critical-path/critical-fetch.ts) |
| 并发 | 核心链路 10～50 并发可通过（不要求全面压测） | 建议 staging 做：同时多用户 Buy Now、多发消息、多会话建连 |
| 队列/Cron/Realtime | Cron 单实例执行；Realtime 多连接不丢消息 | 限流为单实例内存 Map，多实例不共享；Cron 按 Vercel 调度 |

**执行**：可选在 staging 做轻量并发（如 10 用户同时下单、20 用户同时发消息），确认无 5xx、无脏数据。

---

## 8️⃣ 日志与监控检查

| 能力 | 要求 | 验证 |
|------|------|------|
| 核心链路日志 | 订单创建/取消/确认收货/发货、支付、订阅、佣金等有 logAudit | [src/lib/api/audit.ts](src/lib/api/audit.ts)；95+ 文件 withApiLogging/logAudit |
| 异常可告警 | 503、Cron 连续失败、支付 webhook 4xx/5xx、健康检查失败 | [production-runbook](production-runbook.md) 建议告警项 |
| 关键操作追踪 | user_id、resource_id、action、timestamp 写入 audit_log | logAudit 含 userId、resourceId、action |
| 支付/权限/会话/消息 | 可追溯「这笔钱发生了什么」、谁在何时发消息 | payment_transactions、orders、subscriptions；Runbook 对账 |

**执行**：确认 audit_log、cron_logs 在生产可查；告警接收方式（Slack/邮件等）由团队配置。

---

## 9️⃣ 文档与回滚准备

| 项 | 内容 | 衔接 |
|----|------|------|
| 上线手册/操作指南 | 环境变量、迁移顺序、Cron 鉴权、健康检查 | [pre-launch-config-checklist](pre-launch-config-checklist.md) |
| 回滚方案/灾备 | 503 回滚、支付补救、Cron 补跑、迁移回滚 | [production-runbook](production-runbook.md) |
| 生产配置确认 | 环境变量、DB、API、Webhook URL、CRON_SECRET | Gate 0；[env-checklist-for-deploy](env-checklist-for-deploy.md)（如有） |
| 核心链路状态检查 | GET /api/health 200；Stripe Webhook deliveries；cron_logs 最近成功 | Runbook 健康检查与告警 |

**执行**：发布前配置检查表「一～七」逐项打勾，「发布签署」填写负责人与日期。

---

## 🔟 QA / 产品体验验收（轻量）

**不是“全功能回归”，而是重点链路可控。**

| 项 | 内容 |
|----|------|
| 核心链路走一遍 | 注册/登录 → 发帖 → Message seller → 聊天 → Buy Now → 支付 → 订单完成；订阅 → 卖家中心可见 |
| 关键页面 UI | 登录页、结账页、订单页、聊天页、卖家中心：无白屏、按钮状态正确 |
| 异常场景 | 支付失败有提示可重试；权限不足 403/重定向不暴露他人数据 |

**执行**：与 Gate 1 六条链路 staging 手工执行合并；可同一轮填写「手工结果」与 QA 结论。

---

## 执行节奏汇总

| 阶段 | 内容 | 产出 |
|------|------|------|
| 0 | 配置检查表打勾、健康检查 200、Cron 鉴权就绪 | Gate 0 通过 |
| 1 | Gate 1 六条链路在 staging 跑通并填写手工结果 | Gate 1 通过 |
| 2 | Gate 2 异常场景、Gate 3 钱与权限（代码已验，可选抽测） | Gate 2/3 确认 |
| 3 | UI 快速检查、权限/安全、数据与 DB、集成、日志、文档、QA 轻量验收 | 本清单 3～10 项完成 |
| 4 | 发布签署后生产发布 | 上线 |

---

## 与现有文档关系

| 文档 | 本清单对应 |
|------|------------|
| [pre-launch-production-release-gate](pre-launch-production-release-gate.md) | 2️⃣ 上线 Gate |
| [pre-launch-intent-runthrough-checklist](pre-launch-intent-runthrough-checklist.md) | 1️⃣ 核心链路意图 |
| [pre-launch-runthrough-results](pre-launch-runthrough-results.md) | 1️⃣ 推演结果与 Gate 1 手工表 |
| [pre-launch-ui-quick-checklist](pre-launch-ui-quick-checklist.md) | 3️⃣ UI 快速检查 |
| [pre-launch-config-checklist](pre-launch-config-checklist.md) | 4️⃣ 5️⃣ 9️⃣ 配置/DB/发布 |
| [production-runbook](production-runbook.md) | 5️⃣ 6️⃣ 8️⃣ 9️⃣ 回滚/集成/日志/灾备 |

**说明**：本清单为 10 大项的系统性总表，具体逐条执行仍以各子文档为准；Gate 不通过禁止上线。
