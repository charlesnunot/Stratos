# 生产故障预案（Runbook）

本文档覆盖常见生产故障的排查与处理步骤，以及 Cron、支付幂等、限流的说明。

---

## 一、故障条目

### 1. 用户侧 503 Service Unavailable

**现象**：用户访问任意页面返回 503，或 middleware 返回 JSON `{ error: 'Service Unavailable' }`。

**可能原因**：
- 必填环境变量缺失（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）
- 应用启动时 `validateEnvOrThrow()` 失败，生产会标记并对所有请求返回 503

**处理步骤**：
1. 查看部署平台（如 Vercel）的 Runtime Logs / Build Logs，确认是否有 "Environment validation failed" 或缺失变量名。
2. 对照 [pre-launch-config-checklist.md](pre-launch-config-checklist.md) 与 [env-checklist-for-deploy.md](env-checklist-for-deploy.md)，在项目 Settings → Environment Variables 中补齐三项必填变量。
3. 确认 Supabase 项目未暂停、URL 与 Key 正确（无多余空格）。
4. 保存后执行 **Redeploy**，使新配置生效。

**升级**：若修复后仍 503，检查 middleware 与 [src/lib/env/validate.ts](src/lib/env/validate.ts) 逻辑，必要时临时回滚到上一可用部署。

---

### 2. 支付成功但订单/订阅未更新

**现象**：用户在支付渠道（Stripe/PayPal 等）已扣款成功，但站内订单状态仍为待支付，或订阅未激活。

**可能原因**：Webhook 未收到、处理失败、或业务逻辑未正确更新订单/订阅。

**处理步骤**：
1. **查支付渠道**：Stripe Dashboard → Developers → Webhooks → 查看对应 endpoint 的 recent deliveries，确认事件是否 200、是否有重试。
2. **查站内**：Supabase 表 `payment_transactions` 是否有对应 `provider_ref`（如 session_id）且状态成功；表 `orders` / `subscriptions` 对应记录是否已更新。
3. **幂等说明**：当前 Stripe webhook 依赖 `payment_transactions` 按 `provider_ref` 做幂等，重复回调不会重复入账；未按 `event.id` 存表去重，若需更严可后续加 `stripe_webhook_events(event_id)` 表。
4. **补救**：若 webhook 一直失败，可在 Stripe 中 Resend 事件；或根据支付渠道流水与站内数据人工补单/补订阅（需走内部审批）。

**升级**：若同一 webhook 持续 5xx，检查 [src/app/api/payments/stripe/webhook/route.ts](src/app/api/payments/stripe/webhook/route.ts) 及依赖的 RPC/表结构，查看日志中的 error stack。

---

### 3. Cron 单 job 失败

**现象**：定时任务未按预期执行（如订单未自动取消、订阅未续期），或 Vercel Cron 日志显示某路径返回 5xx。

**可能原因**：`CRON_SECRET` 未配置或与调用方不一致（401）；数据库 RPC 失败或超时；业务逻辑异常。

**处理步骤**：
1. **鉴权**：确认 Vercel 项目 Cron 配置的请求头为 `Authorization: Bearer <CRON_SECRET>`，与环境变量一致。
2. **查日志**：Supabase 表 `cron_logs` 按 `job_name`、`status='failed'` 查询，查看 `error_message`、`execution_time_ms`。
3. **区分**：DB 连接/超时错误 → 检查 Supabase 状态与连接池；业务 RPC 报错 → 检查迁移是否已执行、函数是否存在。
4. **补跑**：必要时用 curl 手动触发一次（带 `Authorization: Bearer <CRON_SECRET>`），或由 DBA/开发在 Supabase 中执行等价 SQL/RPC。

**Cron 失败预案摘要**：

| job_name | 影响 | 建议优先级 |
|----------|------|------------|
| cancel_expired_orders | 过期订单未取消 | 高 |
| subscription-lifecycle | 订阅续期/过期未处理 | 高 |
| check-overdue-commissions / deduct-overdue-commissions | 佣金逾期处理 | 中 |
| send-order-expiry-reminders / send-shipping-reminders | 提醒未发 | 中 |
| update-exchange-rates | 汇率未更新 | 中 |
| 其余 | 见 vercel.json 说明 | 按业务 |

---

### 4. 关键路径大面积超时

**现象**：用户反馈「验证超时，请重试」增多，或监控显示关键路径 P95/P99、timeout rate 明显上升。

**可能原因**：Supabase 或第三方（Stripe/PayPal）延迟；冷启动；网络问题。

**处理步骤**：
1. 查看关键路径埋点：`/api/track/critical-path` 接收的 outcome 为 `timeout` 的请求量及对应 `name`。
2. 排查 Supabase Dashboard 的 API 延迟与连接数；排查支付渠道状态页。
3. 若有降级能力：临时关闭非关键功能或延长用户侧等待提示；否则优先恢复依赖方，再考虑扩容或优化查询。

---

### 5. 数据库迁移错误

**现象**：执行迁移后应用报错（如表/列不存在、RPC 不存在），或迁移执行到一半失败。

**处理步骤**：
1. **回滚**：若 Supabase 支持且迁移提供向下兼容的反向脚本，执行回滚到上一版本；记录当前生产对应的**最后成功迁移文件名**（见 [pre-launch-config-checklist.md](pre-launch-config-checklist.md)）。
2. **无反向脚本**：从备份恢复数据库到迁移前状态，再重新执行到目标版本（需提前确认 Supabase 备份策略与恢复流程）。
3. **修复迁移**：在开发环境复现并修正迁移脚本，经测试后再安排生产重新执行。

---

## 二、Cron 与支付、限流说明

### Cron 可观测与告警

- 所有 Cron 成功/失败均写入 `cron_logs`（job_name、status、execution_time_ms、error_message）。
- **建议**：定时（如每日）查询 `status='failed'` 或 `execution_time_ms > 阈值` 的条目；或对接 Vercel Logs / 外部监控，配置「某 job 连续失败」告警，接收端可为 Slack/邮件/Vercel 通知。

### 支付 Webhook 幂等

- **当前**：Stripe webhook 通过 `payment_transactions` 的 `provider_ref`（如 session_id）做幂等，重复回调不会重复入账；未按 `event.id` 存表去重。
- **可选增强**：新增表 `stripe_webhook_events(event_id UNIQUE)`，处理前 insert，唯一冲突则直接 return 200。

### 限流现状

- **当前**：[src/lib/api/rate-limit.ts](src/lib/api/rate-limit.ts) 使用内存 Map，**单实例有效**；Vercel 多实例/Serverless 下不共享，限流效果弱，仅作参考。
- **中期**：若需严格限流，可引入 Redis 或 Supabase 表做分布式计数（单独排期）。

---

## 三、健康检查与告警清单

### 健康检查

- **端点**：`GET /api/health`
- **行为**：校验 Supabase 连通性（一次简单 select），不暴露内部细节；200 表示可探活，503 表示不可用。
- **用途**：平台探活、自检、或与监控告警联动。

### 建议告警项

| 项 | 说明 | 接收方式（示例） |
|----|------|------------------|
| 生产 503 增加 | 基于负载或日志 503 次数/比例 | Slack / 邮件 |
| Cron 单 job 连续失败 | 如同一 job_name 连续 2 次 status=failed | Slack / 邮件 |
| 支付 webhook 4xx/5xx 率上升 | Stripe Dashboard 或自有日志 | Slack / 邮件 |
| 健康检查连续失败 | 如 /api/health 连续 3 次 503 | Vercel / Uptime Robot |

---

## 四、对账（可选）

### 订单与支付

- 定期（如每日）脚本或 SQL：订单状态为 paid 但无对应 `payment_transactions`，或 `payment_transactions` 成功但订单未更新，产出异常列表供人工核对。

### 订阅与权益

- 依赖现有 Cron `subscription-lifecycle` 等处理过期降权；可做一次性地对「过期未降权」数据并修复。

---

**文档版本**：与上线前「能扛」推演计划配套；负责人与升级路径由团队自行在本地补充。
