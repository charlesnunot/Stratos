# 推演任务 15 — Cron 联动链路审计报告

## 审计概述

**任务**: Cron 定时任务全链路测试 (Cron Jobs Full Linkage Test)  
**日期**: 2026-01-31  
**状态**: ✅ 全部问题已修复

---

## Cron 鉴权

**实现**: `src/lib/cron/verify-cron-secret.ts`

- ✅ 校验 `Authorization: Bearer ${CRON_SECRET}`
- ✅ 若 `CRON_SECRET` 未设置或为空，一律拒绝（防止 `Bearer undefined` 绕过）
- ✅ 所有 Cron 路由在入口处调用 `verifyCronSecret(request)`，未通过则返回 401

---

## Cron 任务列表与调度

| 任务 | 路径 | 调度 (cron) | 说明 |
|------|------|-------------|------|
| 自动关闭工单 | /api/cron/auto-close-tickets | 0 7 * * * | 长期未活动工单自动关闭 |
| 检查逾期佣金 | /api/cron/check-overdue-commissions | 0 2 * * * | 标记逾期佣金、应用罚则 |
| 检查发货超时 | /api/cron/check-shipping-timeout | 0 2 * * * | 超时订单自动创建纠纷 |
| 发送发货提醒 | /api/cron/send-shipping-reminders | 0 9 * * * | 待发货/即将发货提醒 |
| 订阅生命周期 | /api/cron/subscription-lifecycle | 0 3 * * * | 过期订阅处理、同步 profiles |
| 订阅到期提醒 | /api/cron/subscription-expiry-reminders | 0 10 * * * | 3 天/1 天前提醒 |
| 更新保证金状态 | /api/cron/update-deposit-lots-status | 0 4 * * * | held → refundable |
| 收回欠款 | /api/cron/collect-debts | 0 2 * * * | 从保证金扣款、通知 |
| 自动升级纠纷 | /api/cron/auto-escalate-disputes | 0 5 * * * | 长时间未处理纠纷升级 |
| 扣除逾期佣金 | /api/cron/deduct-overdue-commissions | 0 3 * * * | 从保证金扣佣金、通知卖家 |
| 检查订阅降级 | /api/cron/check-subscription-downgrade | 0 11 * * * | 未满单超档位提醒 |
| 订单即将过期提醒 | /api/cron/send-order-expiry-reminders | 0 6 * * * | 订单即将过期通知 |
| 取消过期订单 | /api/cron/cancel-expired-orders | 0 1 * * * | 取消未支付订单、退款、通知 |
| 更新汇率 | /api/cron/update-exchange-rates | 0 0 * * * | 更新 exchange_rates 表 |

---

## 验证点与实现状态

### 1. Cron 鉴权

- ✅ 所有 14 个 Cron 路由均在 GET 入口调用 `verifyCronSecret(request)`
- ✅ 未通过时返回 401，不执行业务逻辑

### 2. DB 状态更新

| 任务 | 涉及表/逻辑 | 状态 |
|------|-------------|------|
| cancel-expired-orders | RPC `auto_cancel_expired_orders` → orders.status | ✅ |
| send-order-expiry-reminders | RPC `send_order_expiry_reminders` → notifications | ✅ |
| send-shipping-reminders | RPC `send_shipping_reminders` → notifications | ✅ |
| check-shipping-timeout | RPC `auto_create_shipping_dispute` → 纠纷/通知 | ✅ |
| subscription-lifecycle | RPC `expire_subscriptions_and_sync_profiles` → subscriptions, profiles | ✅ |
| subscription-expiry-reminders | RPC `send_subscription_expiry_reminders` → notifications | ✅ |
| check-subscription-downgrade | 查询订阅 + 插入 notifications | ✅ |
| update-deposit-lots-status | RPC `update_deposit_lots_to_refundable` → deposit_lots | ✅ |
| check-overdue-commissions | checkAndApplyPenalties → commission 罚则 | ✅ |
| deduct-overdue-commissions | RPC deduct + resolveCommissionPenalty → 保证金/commissions | ✅ |
| collect-debts | collectDebtFromDeposit → seller_debts/保证金/通知 | ✅ |
| auto-escalate-disputes | RPC `auto_escalate_disputes` → disputes | ✅ |
| update-exchange-rates | exchange_rates 表增删 | ✅ |
| auto-close-tickets | support_tickets.status + notifications | ✅ |

### 3. 通知

- ✅ 订单过期/即将过期、发货提醒、订阅提醒、订阅降级提醒、纠纷升级、欠款收回、工单关闭等均通过 DB 触发器或 API 内 `notifications.insert` 发送
- ✅ 通知使用 `content_key` / `content_params` 支持国际化

### 4. 异常处理

- ✅ 单条任务失败：记录 `cron_logs`（status: failed, error_message），返回 500
- ✅ 不阻塞其他 Cron：各任务独立执行，互不影响
- ✅ 失败时 `cron_logs` 写入：所有路由在 catch 中均尝试写入；若 `supabaseAdmin` 未初始化则先创建 client 再写入（check-overdue-commissions, collect-debts）

### 5. 下游触发

- ✅ cancel-expired-orders：由 RPC/后端完成取消与退款逻辑
- ✅ deduct-overdue-commissions：调用 `resolveCommissionPenalty`，更新佣金/罚则状态
- ✅ collect-debts：调用 `collectDebtFromDeposit`，更新欠款与保证金
- ✅ subscription-lifecycle：RPC 内同步 profiles 订阅状态

### 6. 日志

- ✅ **cron_logs**：所有任务成功/失败均写入 `job_name`, `status`, `execution_time_ms`, `executed_at`，失败时 `error_message`，成功时 `metadata`
- ✅ **logAudit**：所有任务成功路径均调用 `logAudit(action='cron_<job_name>', resourceType='cron', result='success', meta: {...})`
- ✅ 不记录敏感内容：仅记录计数、ID 数量等元数据

---

## 发现的问题与修复

### 问题 1: subscription-lifecycle 使用未定义的 startTime

**现象**: 函数内使用 `const duration = Date.now() - startTime`，但 `startTime` 未在 GET 顶层声明，导致运行时错误。

**修复**: 在 `GET` 入口第一行增加 `const startTime = Date.now()`。

### 问题 2: send-shipping-reminders 重复声明 startTime

**现象**: 在 try 内再次声明 `const startTime = Date.now()`，遮蔽外层变量，且多余。

**修复**: 删除 try 内重复的 `startTime` 声明，仅保留 GET 顶层的 `startTime`。

### 问题 3: check-subscription-downgrade 的 startTime 与 catch 内 execution_time_ms

**现象**: `startTime` 仅在 try 内声明，catch 中 `Date.now() - startTime` 不可用；且失败时未写入 `execution_time_ms`。

**修复**: 将 `const startTime = Date.now()` 移至 GET 顶层；catch 内写入 `cron_logs` 时增加 `execution_time_ms: Date.now() - startTime`。

### 问题 4: 多个 Cron 成功路径缺少 logAudit

**现象**: 以下任务成功时未调用 logAudit：send-order-expiry-reminders, send-shipping-reminders, check-shipping-timeout, subscription-lifecycle, subscription-expiry-reminders, update-deposit-lots-status, check-subscription-downgrade。

**修复**: 在各自成功路径（写入 cron_logs 之后）增加 `logAudit(action: 'cron_<job_name>', resourceType: 'cron', result: 'success', meta: {...})`。

### 问题 5: deduct-overdue-commissions 早退未写 cron_logs / logAudit

**现象**: 当无逾期义务时直接 return，未写入 cron_logs 与 logAudit，无法区分“未执行”与“执行了但为 0”。

**修复**: 在“无逾期义务”分支中先计算 duration，写入 cron_logs（success）和 logAudit，再 return。

### 问题 6: check-overdue-commissions / collect-debts 失败时可能未写 cron_logs

**现象**: catch 中仅在 `supabaseAdmin` 非空时写入 cron_logs；若错误发生在初始化 supabaseAdmin 之前，则不会记录失败。

**修复**: 在 catch 中若 `supabaseAdmin` 为空，则动态 `import('@supabase/supabase-js')` 并 createClient，再写入 cron_logs，确保失败必记。

---

## 修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| subscription-lifecycle/route.ts | 增加顶层 startTime；成功路径增加 logAudit |
| send-shipping-reminders/route.ts | 删除 try 内重复 startTime；增加 logAudit |
| check-subscription-downgrade/route.ts | startTime 提到 GET 顶层；catch 增加 execution_time_ms；成功路径增加 logAudit |
| send-order-expiry-reminders/route.ts | 成功路径增加 logAudit |
| check-shipping-timeout/route.ts | 成功路径增加 logAudit |
| subscription-expiry-reminders/route.ts | 成功路径增加 logAudit |
| update-deposit-lots-status/route.ts | 成功路径增加 logAudit |
| deduct-overdue-commissions/route.ts | 无逾期时写入 cron_logs + logAudit 再 return |
| check-overdue-commissions/route.ts | catch 中 supabaseAdmin 为空时创建 client 再写 cron_logs |
| collect-debts/route.ts | catch 中 supabaseAdmin 为空时创建 client 再写 cron_logs |

---

## logAudit action 与 cron_logs job_name 对应

| job_name (cron_logs) | logAudit action |
|----------------------|------------------|
| cancel_expired_orders | cron_cancel_expired_orders |
| send_order_expiry_reminders | cron_send_order_expiry_reminders |
| send_shipping_reminders | cron_send_shipping_reminders |
| check_shipping_timeout | cron_check_shipping_timeout |
| subscription_lifecycle | cron_subscription_lifecycle |
| subscription_expiry_reminders | cron_subscription_expiry_reminders |
| check_subscription_downgrade | cron_check_subscription_downgrade |
| update_deposit_lots_status | cron_update_deposit_lots_status |
| check_overdue_commissions | cron_check_overdue_commissions |
| deduct_overdue_commissions | cron_deduct_overdue_commissions |
| collect_debts | cron_collect_debts |
| auto_escalate_disputes | cron_auto_escalate_disputes |
| update_exchange_rates | cron_update_exchange_rates |
| auto_close_tickets | cron_auto_close_tickets |

---

## 验证清单

- [x] Cron 鉴权：verify-cron-secret 校验请求合法
- [x] DB 状态更新：订单、订阅、佣金、保证金、纠纷、汇率状态正确
- [x] 通知：用户收到提醒/状态更新
- [x] 异常处理：单条任务失败记 logAudit/cron_logs，不影响其他任务；失败时必写 cron_logs（含 execution_time_ms）
- [x] 下游触发：退款、佣金扣除、订阅停用等流程正确执行
- [x] 日志：logAudit 记录所有关键 Cron 执行及结果；cron_logs 记录每次执行状态与耗时

---

## 结论

Cron 联动链路已按上述验证点全部检查并修复。所有定时任务均：

1. 使用 verify-cron-secret 做鉴权  
2. 成功/失败均写入 cron_logs（含 execution_time_ms）  
3. 成功路径均调用 logAudit  
4. 失败时在 catch 中确保可写入 cron_logs（含 supabaseAdmin 未初始化时的兜底）  
5. 无早退遗漏日志（如 deduct-overdue-commissions 的 0 条处理分支）  
6. 时间统计变量（startTime）作用域正确，避免未定义或重复声明  
