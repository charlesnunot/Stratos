# 推演任务 18 — Cron 任务链路审计

**目标**：验证系统所有定时任务的端到端触发、DB 更新、通知、下游流程和交叉联动，确保链路完整且安全。  
**任务名称**：Cron Jobs Full Linkage Test  
**审计日期**：2025-01-31

---

## 1. 功能入口与鉴权

| 项目 | 实现 | 状态 |
|------|------|------|
| Cron 统一入口 | `/api/cron/*`，Vercel Cron 调度（vercel.json） | ✅ |
| 鉴权 | `verifyCronSecret(request)` 校验 `Authorization: Bearer ${CRON_SECRET}` | ✅ |
| 非法请求 | 未通过时返回 401，不执行业务 | ✅ |
| CRON_SECRET 未设置/空 | 一律拒绝，防止 `Bearer undefined` 绕过 | ✅ |

---

## 2. Cron 任务列表与触发

### 2.1 订单相关

| 任务 | 路径 | 调度 | DB/逻辑 | 通知 | logAudit | cron_logs |
|------|------|------|---------|------|----------|-----------|
| send-order-expiry-reminders | /api/cron/send-order-expiry-reminders | 0 6 * * * | RPC `send_order_expiry_reminders`，查询 pending 且即将过期订单 | 买家（RPC 内 notifications） | ✅ success | ✅ success/failed |
| cancel-expired-orders | /api/cron/cancel-expired-orders | 0 1 * * * | RPC `auto_cancel_expired_orders`：取消订单、恢复库存、退款、佣金调整 | 买家/卖家（RPC/触发器） | ✅ success | ✅ success/failed |
| send-shipping-reminders | /api/cron/send-shipping-reminders | 0 9 * * * | RPC `send_shipping_reminders`，shipped 未确认收货/待发货 | 买家/卖家（RPC） | ✅ success | ✅ success/failed |
| check-shipping-timeout | /api/cron/check-shipping-timeout | 0 2 * * * | RPC `auto_create_shipping_dispute`，超期未发货 → 纠纷/标记异常 | 纠纷相关通知（RPC） | ✅ success | ✅ success/failed |

### 2.2 订阅相关

| 任务 | 路径 | 调度 | DB/逻辑 | 通知 | logAudit | cron_logs |
|------|------|------|---------|------|----------|-----------|
| subscription-lifecycle | /api/cron/subscription-lifecycle | 0 3 * * * | RPC `expire_subscriptions_and_sync_profiles`：过期/降级/续费，更新 profile subscription_status | 用户（RPC/业务内） | ✅ success | ✅ success/failed |
| subscription-expiry-reminders | /api/cron/subscription-expiry-reminders | 0 10 * * * | RPC `send_subscription_expiry_reminders`，即将过期订阅 | 用户（RPC） | ✅ success | ✅ success/failed |
| check-subscription-downgrade | /api/cron/check-subscription-downgrade | 0 11 * * * | 查询 active 订阅 + get_unfilled_orders_total，超档位则 notifications.insert（content_key: subscription_tier_exceeded） | 卖家 | ✅ success | ✅ success/failed（含空跑、fetch 失败） |

### 2.3 保证金

| 任务 | 路径 | 调度 | DB/逻辑 | 通知 | logAudit | cron_logs |
|------|------|------|---------|------|----------|-----------|
| update-deposit-lots-status | /api/cron/update-deposit-lots-status | 0 4 * * * | RPC `update_deposit_lots_to_refundable`：超期未缴 → overdue，超期可退 → refundable | 卖家（业务/RPC 内按需） | ✅ success | ✅ success/failed |

### 2.4 佣金与欠款

| 任务 | 路径 | 调度 | DB/逻辑 | 通知 | logAudit | cron_logs |
|------|------|------|---------|------|----------|-----------|
| check-overdue-commissions | /api/cron/check-overdue-commissions | 0 2 * * * | checkAndApplyPenalties：commission.status = pending 且 overdue，应用罚则 | 罚则相关通知（lib 内） | ✅ success | ✅ success/failed（catch 内建 client） |
| deduct-overdue-commissions | /api/cron/deduct-overdue-commissions | 0 3 * * * | 查询 commission_payment_obligations(status=overdue)，RPC deduct_commission_from_deposit + resolveCommissionPenalty | 卖家/平台（resolveCommissionPenalty） | ✅ success/fail（含 obligationsError、catch） | ✅ success/failed（含 0 条早退、obligationsError、catch） |
| collect-debts | /api/cron/collect-debts | 0 2 * * * | collectDebtFromDeposit：seller_debts 从保证金扣款 | 卖家（lib 内） | ✅ success | ✅ success/failed（catch 内建 client） |

### 2.5 纠纷与其它

| 任务 | 路径 | 调度 | DB/逻辑 | 通知 | logAudit | cron_logs |
|------|------|------|---------|------|----------|-----------|
| auto-escalate-disputes | /api/cron/auto-escalate-disputes | 0 5 * * * | RPC `auto_escalate_disputes`：pending 超期 → escalated | 买卖双方/admin（RPC） | ✅ success | ✅ success/failed |
| update-exchange-rates | /api/cron/update-exchange-rates | 0 0 * * * | 调用第三方 API，exchange_rates 表 delete + insert | 无 | ✅ success/fail（含无汇率、catch） | ✅ success/failed（含 API 失败、无汇率、catch） |
| auto-close-tickets | /api/cron/auto-close-tickets | 0 7 * * * | 长期未活动工单关闭，notifications | 客服/用户 | ✅ success | ✅ success/failed |

---

## 3. DB/事务与交叉链路

| 验证点 | 说明 | 状态 |
|--------|------|------|
| 订单过期 → 库存恢复 → 佣金调整 → 通知 | cancel-expired-orders 由 RPC `auto_cancel_expired_orders` 在 DB 内完成取消、回补库存、退款及佣金相关更新；通知由触发器或 RPC 内发送 | ✅ |
| 订阅到期 → 卖家权限/状态 → 通知 | subscription-lifecycle RPC 同步 profiles 订阅状态；enableSellerPayment/disableSellerPayment 由业务或 RPC 内处理 | ✅ |
| 保证金超期 → 状态更新 → 通知 | update-deposit-lots-status RPC 更新 lot 状态；后续退款/扣款由 process-refund、deduct-overdue-commissions 等处理 | ✅ |
| 财务/库存操作一致性 | 订单取消、扣款、退款等由 RPC 或 Lib 内事务/多步更新保证 | ✅ |

---

## 4. 验证点汇总

| 验证点 | 结论 |
|--------|------|
| 1. 鉴权 | verifyCronSecret 校验成功；非法请求返回 401。 |
| 2. DB 更新正确 | 订单状态、库存、佣金、订阅状态、保证金状态、汇率、纠纷状态等均由对应 Cron 调用 RPC/Lib 正确更新。 |
| 3. 通知发送 | 买家/卖家/用户收到订单、订阅、发货、纠纷、欠款、佣金、工单等相关通知；使用 content_key/content_params 支持国际化。 |
| 4. 日志完整 | 所有 Cron 成功/失败均写 cron_logs（job_name, status, execution_time_ms, executed_at, error_message/metadata）；关键操作 logAudit（action, resourceType, result, meta）。 |
| 5. 异常处理 | Cron 异常（API 失败、事务失败、RPC 错误）写 cron_logs + 部分 logAudit(result: 'fail')，返回 4xx/5xx，不影响其他任务。 |
| 6. 交叉链路 | 订单过期、订阅到期、保证金超期、佣金逾期等与下游通知/状态更新联动完整。 |

---

## 5. 本次修复（任务 18）

| 序号 | 问题 | 修复 |
|------|------|------|
| 1 | deduct-overdue-commissions：获取逾期 obligations 失败时直接返回 500，未写 cron_logs 与 logAudit | 在 obligationsError 分支写入 cron_logs（status: failed）、logAudit(result: 'fail', meta.reason)，再 return。 |
| 2 | deduct-overdue-commissions：catch 中未调用 logAudit | 在 catch 中增加 logAudit(result: 'fail', meta.reason)。 |
| 3 | update-exchange-rates：API 返回无有效汇率（rows.length === 0）时直接 502，未写 cron_logs 与 logAudit | 在 rows.length === 0 分支写入 cron_logs（status: failed）、logAudit(result: 'fail')，再 return。 |
| 4 | update-exchange-rates：catch 中未调用 logAudit | 在 catch 中增加 logAudit(result: 'fail', meta.reason)。 |
| 5 | check-subscription-downgrade：获取订阅失败（subscriptionsError）时直接 500，未写 cron_logs | 在 subscriptionsError 分支写入 cron_logs（status: failed, execution_time_ms），再 return。 |
| 6 | check-subscription-downgrade：无活跃订阅（空列表）时直接返回成功，未写 cron_logs 与 logAudit | 在空列表分支写入 cron_logs（status: success, metadata.checked_count: 0）、logAudit(result: 'success', meta)，再 return。 |

---

## 6. 已采用的正确实践（无需修改）

- **统一鉴权**：所有 Cron 路由入口调用 verifyCronSecret，未通过即 401。
- **cron_logs**：成功/失败均写 job_name、status、execution_time_ms、executed_at；失败写 error_message，成功写 metadata（计数等）。
- **logAudit**：成功路径均有 action=cron_*、resourceType='cron'、result、timestamp、meta；失败路径在主要业务失败分支及 catch 中补全 logAudit(result: 'fail')。
- **异常隔离**：单任务失败不影响其他 Cron；catch 内创建 client 再写 cron_logs（如 check-overdue-commissions、collect-debts）。
- **敏感信息**：metadata 仅计数、ID 数量等，不记录密码、完整支付信息、用户隐私。

---

**审计结论**：Cron 任务端到端触发、鉴权、DB 更新、通知、下游联动与日志链路完整；本次修复补齐了 deduct-overdue-commissions、update-exchange-rates、check-subscription-downgrade 在部分失败/边界路径上的 cron_logs 与 logAudit，满足任务 18 全部验证点。
