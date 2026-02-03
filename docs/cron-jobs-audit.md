# 定时任务（Cron Jobs）模块审计报告（任务 31）

**审计目标**：确保定时任务按预期执行、安全可靠、任务失败可追踪，避免数据异常或漏执行。  
**审计日期**：2025-01-31  
**范围**：`/api/cron/*` 全部路由、`vercel.json` 调度、`verify-cron-secret`、`cron_logs` 表及监控面板。

---

## 1. 任务执行与调度

**接口与配置**：`vercel.json` 中 12 个 cron 路径；各路由 GET 实现。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 任务按设定时间间隔触发 | **通过**：Vercel Cron 按 cron 表达式每日触发（0 0 * * * 至 0 11 * * * 等），无重叠；调度由平台控制。 | 通过 | 无。 |
| 并发任务不会导致重复执行或竞态条件 | **通过**：同一 job 每日一次；订单取消、订阅过期、汇率更新等依赖 DB 函数或幂等写（如汇率先 delete 再 insert 同一天）；无应用层锁，依赖 Vercel 单实例触发。 | 通过 | 无。 |
| 异常任务是否有重试机制 | **部分**：Vercel Cron 无内置重试；任务失败仅返回 500，监控面板可看到 failed。 | **低** | 已加强：所有任务失败时写入 cron_logs(status: 'failed')，便于监控与人工重试。 |

---

## 2. 关键业务任务

**任务列表**：订单过期取消、发货提醒/超时、订阅生命周期/到期提醒/降级检查、纠纷升级、欠款扣款/催收、汇率更新、保证金状态更新。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 任务执行结果与数据库状态一致 | **通过**：订单取消、订阅过期、纠纷升级、汇率更新等均调用 DB 函数或 RPC；业务逻辑在 DB 或统一 lib 中，一致性由事务/函数保证。 | 通过 | 无。 |
| 异常可追踪 | **问题**：部分任务无 cron_logs（cancel-expired-orders、check-overdue-commissions、collect-debts、send-shipping-reminders、update-exchange-rates）；有 cron_logs 的任务失败时未写入 failure。 | **中** | **已修复**：上述 5 个任务补充 success/failure 写入 cron_logs；所有任务在 RPC/业务失败分支及 catch 中写入 status: 'failed'。 |

---

## 3. 权限与安全

**鉴权**：`verify-cron-secret.ts`；请求头 `Authorization: Bearer <CRON_SECRET>`。

### 3.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| Cron 接口仅允许授权系统调用 | **通过**：CRON_SECRET 未设置或为空时一律 401；校验 `authHeader === \`Bearer ${secret}\``，防止 "Bearer undefined" 等绕过。 | 通过 | 无。 |
| 防止外部请求触发敏感操作 | **通过**：无 secret 则 401；Vercel Cron 调用时注入 CRON_SECRET，外部无法获知。 | 通过 | 无。 |

---

## 4. 日志与监控

**日志**：`cron_logs` 表（job_name, status, execution_time_ms, executed_at, metadata, error_message）；监控面板读取 cron_logs。

### 4.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 每个任务执行结果记录日志 | **问题**：cancel-expired-orders、check-overdue-commissions、collect-debts、send-shipping-reminders、update-exchange-rates 未写 cron_logs；失败分支多数未写 failure。 | **中** | **已修复**：上述任务均写 success/failure；所有任务在错误路径写 failure。 |
| 异常任务有告警 | **通过**：监控面板按 cron_logs 展示 success/failure；失败记录可被管理员看到。 | 通过 | 无。 |
| 日志中不泄露敏感信息 | **问题**：subscription-lifecycle、auto-escalate-disputes 等将 affected_user_ids、escalated_disputes 写入 metadata 或 console，可能含用户/纠纷 ID。 | **低** | **已修复**：metadata 仅存计数（affected_users_count、escalated_count）；console 仅 NODE_ENV === 'development' 输出；check-subscription-downgrade 不向 console 输出 seller user_id，metadata 仅 error_count。 |

---

## 5. 数据一致性与回滚

### 5.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|------------------|
| 任务执行失败时不会导致数据不一致 | **通过**：订单取消、订阅过期、纠纷升级等为 DB 函数原子操作；汇率更新先 delete 再 insert 同一天，幂等；欠款扣款逐条处理，单条失败记 errors 不中断。 | 通过 | 无。 |
| 异常处理可回滚或恢复 | **通过**：无多步跨表事务依赖“全部成功”；单步失败即返回 500 并记 cron_logs failed，可人工排查后重跑或修复数据。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 修复状态 |
|------|--------|----------|----------|----------|
| 1 | 部分任务无 cron_logs | cancel-expired-orders、check-overdue-commissions、collect-debts、send-shipping-reminders、update-exchange-rates 未写日志 | **中** | ✅ 已修复 |
| 2 | 失败分支未写 failure | 多数任务仅在成功时写 cron_logs，失败/异常未写 | **中** | ✅ 已修复（所有任务失败路径写 status: 'failed'） |
| 3 | 生产环境 console 与敏感 metadata | console.log/console.error 直接输出；metadata 含 user_id 列表等 | **低** | ✅ 已修复（console 仅开发环境；metadata 仅计数） |
| 4 | catch 与错误类型 | 多处 catch (error: any)、未统一 error: unknown | **低** | ✅ 已修复（catch (error: unknown)，message 安全取值） |
| 5 | deduct-overdue 使用非法 status | cron_logs status 使用 'partial'，表约束仅 success/failed/running | **低** | ✅ 已修复（改为 'success'，error_count 入 metadata） |

---

## 7. 已采用的正确实践（无需修改）

- **鉴权**：verifyCronSecret 统一校验 CRON_SECRET；未配置或空则 401。
- **调度**：vercel.json 配置清晰，任务时间错开，避免同一时刻多任务挤占。
- **业务**：订单取消、订阅过期、纠纷升级、汇率更新等依赖 DB 函数，逻辑集中、可测。
- **幂等**：汇率更新按日 delete 再 insert；订单取消等为状态更新，重复执行安全。

---

## 8. 涉及文件与变更

| 类型 | 路径 | 变更摘要 |
|------|------|----------|
| Cron | `src/app/api/cron/cancel-expired-orders/route.ts` | 增加 cron_logs success/failure；catch (error: unknown)；console 仅开发 |
| Cron | `src/app/api/cron/check-overdue-commissions/route.ts` | 增加 cron_logs success/failure；catch (error: unknown)；console 仅开发 |
| Cron | `src/app/api/cron/collect-debts/route.ts` | 增加 cron_logs success（metadata 含计数）；catch (error: unknown)；内层 catch 类型安全；console 仅开发 |
| Cron | `src/app/api/cron/send-shipping-reminders/route.ts` | 增加 cron_logs success/failure；catch (error: unknown)；console 仅开发 |
| Cron | `src/app/api/cron/update-exchange-rates/route.ts` | 增加 cron_logs success/failure（含 catch）；console 仅开发；catch 已有 err: unknown |
| Cron | `src/app/api/cron/subscription-lifecycle/route.ts` | 失败分支写 cron_logs failed；catch 写 failed；metadata 仅计数；console 仅开发；catch (error: unknown) |
| Cron | `src/app/api/cron/auto-escalate-disputes/route.ts` | 失败分支写 cron_logs failed；metadata 仅 escalated_count；console 仅开发；catch (error: unknown) |
| Cron | `src/app/api/cron/check-shipping-timeout/route.ts` | 失败分支写 cron_logs failed；console 仅开发；catch (error: unknown) |
| Cron | `src/app/api/cron/send-order-expiry-reminders/route.ts` | 失败分支写 cron_logs failed；console 仅开发；catch (error: unknown) |
| Cron | `src/app/api/cron/subscription-expiry-reminders/route.ts` | 失败分支写 cron_logs failed；简化 success 写入；catch (error: unknown) |
| Cron | `src/app/api/cron/update-deposit-lots-status/route.ts` | 失败分支写 cron_logs failed；metadata 仅 updated_count；console 仅开发；catch (error: unknown) |
| Cron | `src/app/api/cron/deduct-overdue-commissions/route.ts` | status 改为 'success'，metadata 含 error_count；内层 catch (error: unknown)；console 仅开发；catch (error: unknown) |
| Cron | `src/app/api/cron/check-subscription-downgrade/route.ts` | metadata 仅计数与 error_count；console 不输出 user_id，仅开发；catch (error: unknown) |

---

**审计结论**：定时任务在鉴权、调度与业务逻辑上设计正确。**已修复** 部分任务无 cron_logs、失败未写 failure、生产环境 console 与敏感 metadata、catch 类型及 deduct-overdue status 非法等问题。修复后满足「按预期执行、安全可靠、失败可追踪、日志不泄密」的审计目标。
