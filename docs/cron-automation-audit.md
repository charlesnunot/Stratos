# 定时任务与后台自动化流程（Cron）— 审计报告

**审计范围**：任务列表与功能、权限与安全、数据一致性、日志与监控、异常处理  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议，便于追踪。

---

## 1. 任务列表与功能

**模块**：`/api/cron/*`（vercel.json 中配置 12 个 cron 路径）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 订单过期处理 | **通过**：cancel-expired-orders 调用 RPC `auto_cancel_expired_orders`；send-order-expiry-reminders 调用 `send_order_expiry_reminders`。 | 通过 | 无。 |
| 发货提醒 | **通过**：send-shipping-reminders 调用 `send_shipping_reminders`；check-shipping-timeout 调用对应 RPC 处理超时。 | 通过 | 无。 |
| 订阅生命周期更新（续订、到期、取消） | **通过**：subscription-lifecycle 调用 `expire_subscriptions_and_sync_profiles`；subscription-expiry-reminders 发送到期提醒；check-subscription-downgrade 处理降级。 | 通过 | 无。 |
| 纠纷升级、欠款、汇率更新 | **通过**：auto-escalate-disputes 调用 `auto_escalate_disputes`；collect-debts 遍历 pending 欠款并调用 collectDebtFromDeposit；update-exchange-rates 拉取汇率 API 并写入 exchange_rates；deduct-overdue-commissions、check-overdue-commissions 处理佣金逾期与罚金。 | 通过 | 无。 |

---

## 2. 权限与安全

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 定时任务是否只能由系统自动执行 | **通过**：所有 cron 接口均校验 `Authorization: Bearer ${CRON_SECRET}`，未携带或错误则 401。Vercel Cron 在环境变量中配置 CRON_SECRET 后会自动携带。 | 通过 | 无。 |
| 防止外部用户通过接口触发敏感操作 | **部分**：若环境变量 CRON_SECRET **未设置**，则 `Bearer ${process.env.CRON_SECRET}` 为 `"Bearer undefined"`，任何人发送 `Authorization: Bearer undefined` 即可通过校验，存在绕过风险。 | **中** | 要求 CRON_SECRET 必须已设置且非空再比对；未设置或为空时一律 401。 |
| 权限校验和安全日志记录 | **通过**：鉴权失败返回 401，不记录请求体；成功执行部分任务写入 cron_logs（job_name、status、execution_time_ms、metadata）。 | 通过 | 无。 |

---

## 3. 数据一致性

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 任务执行是否正确更新数据库状态 | **通过**：订单取消、订阅过期、纠纷升级、欠款收取、汇率写入、保证金状态、佣金罚金等均通过 RPC 或 Supabase Admin 写库，逻辑集中在 DB 或已有 lib。 | 通过 | 无。 |
| 异常中断或失败时是否有回滚或补偿 | **部分**：单次任务内多为一次或顺序 RPC/写库，无显式事务包装；collect-debts 按卖家循环，单个失败记入 errors 数组不中断其余。失败时返回 500，无自动重试；依赖 Vercel Cron 下次调度或人工处理。 | **低** | 可选：对关键任务在 DB 层使用事务；失败时写入 cron_logs 的 status='fail' 便于监控与人工补偿。 |
| 多任务并行执行时是否避免冲突 | **通过**：vercel.json 中各任务调度时间错开（0 0–11 * * * 不同小时）；同一任务同一时刻仅一份调度，无多实例并发写同一资源的设计。 | 通过 | 无。 |

---

## 4. 日志与监控

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 每次任务执行是否有详细日志 | **部分**：部分任务成功时写入 cron_logs（check-subscription-downgrade、update-deposit-lots-status、subscription-lifecycle、subscription-expiry-reminders、send-order-expiry-reminders、deduct-overdue-commissions、check-shipping-timeout、auto-escalate-disputes）；cancel-expired-orders、send-shipping-reminders、collect-debts、check-overdue-commissions、update-exchange-rates **未**写入 cron_logs，仅 console.log/console.error。 | **低** | 可选：为未写 cron_logs 的任务增加成功/失败写入，便于监控面板统一展示。 |
| 异常任务是否可监控告警 | **部分**：cron_logs 有 status、execution_time_ms、metadata，监控 dashboard 可查；失败分支多数未写入 cron_logs（status='fail'），仅返回 500 与 console.error，需依赖外部监控（如 Vercel 告警）发现失败。 | **低** | 可选：任务 catch 分支写入 cron_logs status='fail'、error_message 摘要。 |
| 日志中敏感数据是否受保护 | **通过**：cron_logs 的 metadata 多为计数或 ID 列表（订单/纠纷/用户数），无密码、支付详情；console 输出为错误信息与耗时，未发现明文密钥或完整用户信息。 | 通过 | 无。 |

---

## 5. 异常处理

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 |
|--------|----------|----------|----------|
| 网络异常、数据库异常、外部接口调用失败是否有处理 | **通过**：各任务 try/catch，RPC 或 fetch 失败时 catch 返回 500；update-exchange-rates 对 fetch 与 res.ok 有判断，失败返回 502。 | 通过 | 无。 |
| 定时任务失败是否可重试或通知管理员 | **部分**：无内置重试；失败仅返回 500 与 console.error，依赖 Vercel Cron 下次运行或运维根据监控/告警处理。 | **低** | 可选：失败时写入 cron_logs status='fail'；或集成告警（如 Sentry/邮件）通知管理员。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复建议 |
|------|--------|----------|----------|----------|
| 1 | CRON_SECRET 未设置时可绕过 | 未设置时 "Bearer undefined" 可被伪造通过鉴权 | **中** | 要求 CRON_SECRET 已设置且非空，否则一律 401 |
| 2 | 部分任务未写 cron_logs | 5 个任务无 cron_logs，不利统一监控 | **低** | 可选：为所有任务增加成功/失败写入 cron_logs |
| 3 | 失败未写 cron_logs | 失败仅 500+console，无 DB 记录 | **低** | 可选：catch 中写入 status='fail' |

---

## 7. 已采用的正确实践（无需修改）

- **鉴权**：所有 cron 接口均校验 Authorization Bearer 与 CRON_SECRET。
- **执行**：使用 Supabase Admin 或 RPC，逻辑清晰；collect-debts 单卖家失败不阻断其余。
- **日志**：部分任务成功时写入 cron_logs（job_name、status、execution_time_ms、metadata）；console 有起止与错误信息。
- **调度**：vercel.json 配置明确，时间错开，无重叠并发。

---

## 8. 已实施的修复

| 序号 | 检查项 | 修复内容 |
|------|--------|----------|
| 1 | CRON_SECRET 未设置时可绕过 | **已修复**：新增 `src/lib/cron/verify-cron-secret.ts`，校验 `process.env.CRON_SECRET` 存在、为字符串且非空后再比对 `Authorization: Bearer ${secret}`；未设置或为空一律返回 401。所有 12 个 cron 路由改为调用 `verifyCronSecret(request)`，未通过则直接返回 401。 |

---

**审计结论**：定时任务功能与数据一致性良好，权限依赖 CRON_SECRET；**主要问题**为 **CRON_SECRET 未设置时仍可被 "Bearer undefined" 绕过**（中），已通过统一校验“存在且非空”修复。建议生产环境务必配置 CRON_SECRET；可选为全部任务增加 cron_logs 成功/失败记录及失败告警。
