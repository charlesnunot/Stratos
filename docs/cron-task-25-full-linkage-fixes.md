# 推演任务 25 — Cron 任务全链路修复总结

## 审计范围
- 入口：`src/app/api/cron/[task]/route.ts`
- 鉴权：`verify-cron-secret`
- 14 个 Cron 任务（含 auto-close-tickets）
- vercel.json 调度

## 已修复问题

### 1. collect-debts — 欠款查询错误处理缺失
**问题**：`seller_debts` 查询未检查 `error`，查询失败时误报成功。  
**修复**：添加 `debtsError` 校验，失败时写入 cron_logs、logAudit、返回 500。

### 2. auto-close-tickets — 审计日志不一致
**问题**：`closedCount === 0` 时不调用 logAudit，与其他 Cron 行为不一致。  
**修复**：每次成功执行都调用 logAudit（无论 closedCount 是否为 0）。

### 3. penalty-manager — 静默吞掉异常
**问题**：`checkAndApplyPenalties` 的 catch 仅 console.error，查询失败时 Cron 仍返回成功。  
**修复**：在 catch 中 `throw error`，让 check-overdue-commissions 能正确返回 500。

### 4. deduct-overdue-commissions — 单次扣款审计
**问题**：规范要求对每次扣款做 logAudit(action='cron_deduct_overdue_commission', sellerId, commissionId)。  
**现状**：已在循环内按 obligation 记录 logAudit（含 userId、resourceId、meta.deducted_amount）。

### 5. update-deposit-lots-status — 缺少卖家通知
**问题**：规范要求 lot 状态变为 refundable 时通知卖家。  
**修复**：新增 migration `198_deposit_lots_notify_on_refundable.sql`，在 `update_deposit_lots_to_refundable` 中于更新后插入 notifications（content_key: deposit_status_updated）。

### 6. subscription-lifecycle — 缺少用户通知
**问题**：规范要求订阅过期时通知用户。  
**修复**：新增 migration `199_subscription_lifecycle_notify_on_expire.sql`，在 `expire_subscriptions_and_sync_profiles` 中对每个过期订阅插入 notifications（content_key: subscription_status_changed）。

### 7. verify-cron-secret — 空 Authorization 防御
**修复**：增加 `!authHeader` 判断，显式拒绝缺失 Authorization 的请求。

## 验证矩阵

| Cron 任务 | 鉴权 | 数据更新 | 通知 | 审计日志 | 失败路径 |
|-----------|------|----------|------|----------|----------|
| send-order-expiry-reminders | ✅ | RPC | 买家 (RPC) | ✅ | ✅ |
| cancel-expired-orders | ✅ | RPC+库存 | 买家/卖家 (RPC) | ✅ | ✅ |
| send-shipping-reminders | ✅ | - | 卖家 (RPC) | ✅ | ✅ |
| check-shipping-timeout | ✅ | 纠纷 | 买家/卖家 (RPC) | ✅ | ✅ |
| subscription-lifecycle | ✅ | RPC+profile | 用户 (RPC, 新增) | ✅ | ✅ |
| subscription-expiry-reminders | ✅ | - | 用户 (RPC) | ✅ | ✅ |
| check-subscription-downgrade | ✅ | - | 卖家 | ✅ | ✅ |
| update-deposit-lots-status | ✅ | RPC | 卖家 (RPC, 新增) | ✅ | ✅ |
| check-overdue-commissions | ✅ | penalties | 卖家 (penalty-manager) | ✅ | ✅ 抛错 |
| deduct-overdue-commissions | ✅ | RPC | - | ✅ 每笔+汇总 | ✅ |
| collect-debts | ✅ | lib | 卖家 (lib) | ✅ | ✅ 查询失败 |
| auto-escalate-disputes | ✅ | RPC | 管理员 (RPC) | ✅ | ✅ |
| update-exchange-rates | ✅ | exchange_rates | - | ✅ | ✅ |
| auto-close-tickets | ✅ | support_tickets | 用户 | ✅ | ✅ |

## 下游联动确认

- **cancel-expired-orders**：RPC `auto_cancel_expired_orders` 负责取消、库存恢复、买家/卖家通知
- **subscription-lifecycle**：RPC 负责过期、profile 同步、用户通知
- **update-deposit-lots-status**：RPC 负责 lot 状态更新、卖家通知，可触发接单恢复（checkRecoveryOnOrderCompletion 由业务逻辑按 lot 状态判断）
- **check-overdue-commissions**：penalty-manager 负责罚金、通知、profile 更新、商品隐藏
- **deduct-overdue-commissions**：RPC + resolveCommissionPenalty 负责扣款与惩罚解决

## 修改文件清单

- `src/app/api/cron/collect-debts/route.ts` — 查询错误处理
- `src/app/api/cron/auto-close-tickets/route.ts` — 审计日志逻辑
- `src/lib/commissions/penalty-manager.ts` — 异常重新抛出
- `src/lib/cron/verify-cron-secret.ts` — 空 auth 防御
- `supabase/migrations/198_deposit_lots_notify_on_refundable.sql` — 保证金通知
- `supabase/migrations/199_subscription_lifecycle_notify_on_expire.sql` — 订阅过期通知
