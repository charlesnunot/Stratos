# 推演任务 21 — 订阅与打赏功能链路审计

**目标**：验证订阅购买、支付、卖家功能激活、打赏流程（用户与帖子）、通知与 Cron 后续处理的完整端到端链路，确保权限、事务、RLS 与数据一致性。  
**任务名称**：Subscription & Tip Full Linkage Test  
**审计日期**：2025-01-31

---

## 1. 功能入口与鉴权

| 类别 | 入口 | 鉴权 | 状态 |
|------|------|------|------|
| 订阅 | 页面 /subscription/checkout、/subscription/plans；API /api/subscriptions/create-pending、create-payment | useAuth；创建订阅仅限登录用户；create-payment 校验 sub.user_id === user.id | ✅ |
| 打赏（帖子） | 帖子详情 /post/[id]；create-tip-session → process-tip-payment | 登录用户；checkTipEnabled、黑名单、接收方 tip_enabled、checkTipLimits | ✅ |
| 打赏（用户） | 用户详情 /profile/[id]；create-user-tip-session → process-user-tip-payment | 同上 | ✅ |
| 卖家激活 | enableSellerPayment（process-subscription-payment、activatePendingSubscription） | 订阅支付成功后调用，更新 profile/收款资格 | ✅ |

---

## 2. 典型链路验证

### 2.1 订阅购买

| 步骤 | 实现 | 状态 |
|------|------|------|
| 前端选择计划 → /api/subscription/create-pending | create-pending 校验登录、subscriptionType/tier、金额由 getSubscriptionPrice 计算 | ✅ |
| 后端生成 pending subscription 记录 | subscriptions 表 insert status=pending | ✅ |
| 调用 create-payment-session（Stripe/Alipay/WeChat/PayPal） | create-checkout-session、create-payment 等 | ✅ |
| 前端跳转支付网关 | 成功返回 session URL 或支付参数 | ✅ |

### 2.2 支付回调（订阅）

| 步骤 | 实现 | 状态 |
|------|------|------|
| verify webhook → 校验签名 | Stripe：constructEvent；支付宝/微信/银行按各自校验 | ✅ |
| process-subscription-payment / activatePendingSubscription | 更新 subscription 状态为 active；sync_profile_subscription_derived；enableSellerPayment（seller 类型） | ✅ |
| 更新 profile：subscription_status、subscription_expires_at 等 | RPC sync_profile_subscription_derived | ✅ |
| 写入 notifications | content_key: subscription_renewed，content_params | ✅ |
| logAudit（action: subscription_payment_success） | processSubscriptionPayment、activatePendingSubscription 内 logAudit(userId, resourceId, meta: planId/tier/amount) | ✅（已补充） |

### 2.3 订阅过期/降级（Cron）

| 步骤 | 实现 | 状态 |
|------|------|------|
| subscription-lifecycle | RPC expire_subscriptions_and_sync_profiles；Cron logAudit: cron_subscription_lifecycle | ✅ |
| subscription-expiry-reminders | RPC send_subscription_expiry_reminders | ✅ |
| check-subscription-downgrade | 超档位提醒、notifications（content_key: subscription_tier_exceeded） | ✅ |
| 禁用卖家功能 | sync 后 profile 无有效 seller 订阅则收款资格由 payment-control 逻辑更新 | ✅ |

### 2.4 帖子打赏

| 步骤 | 实现 | 状态 |
|------|------|------|
| create-tip-session → 前端跳转支付 | create-tip-session 校验 tip 订阅、黑名单、接收方 tip_enabled、限额 | ✅ |
| 支付成功回调 → process-tip-payment | 校验黑名单、checkTipEnabled、接收方 tip_enabled、recipient tip 订阅、checkTipLimits | ✅ |
| 写入 tip_transactions | post_id、tipper_id、recipient_id、amount、status=paid | ✅ |
| 更新帖子金额（tip_amount_total） | posts.tip_amount += amount | ✅ |
| 写通知：帖子作者 | notifications content_key: tip_received | ✅ |
| logAudit（action: tip_post） | logAudit(action: 'tip_post', userId, resourceId: postId, meta: amount, currency) | ✅（已对齐） |
| 可触发 affiliate/推广佣金 | process-tip-payment 后由业务侧按需调用 calculateAndCreateCommissions 等 | ✅（按业务设计） |

### 2.5 用户打赏（UserTip）

| 步骤 | 实现 | 状态 |
|------|------|------|
| create-user-tip-session → process-user-tip-payment | 同帖打赏校验（tip 订阅、黑名单、接收方开启、限额） | ✅ |
| 写入 tip_transactions | post_id: null，tipper_id、recipient_id、amount | ✅ |
| 写通知：被打赏用户 | content_key: user_tip_received | ✅ |
| logAudit（action: tip_user） | logAudit(action: 'tip_user', userId, resourceId: recipientId, meta: amount, currency) | ✅（已对齐） |

---

## 3. DB/事务与数据一致性

| 验证点 | 说明 | 状态 |
|--------|------|------|
| Subscription 状态 active/inactive 正确 | 支付成功写 active；Cron RPC 过期更新；sync_profile_subscription_derived 同步 profile | ✅ |
| profile subscription 状态、卖家功能同步 | sync_profile_subscription_derived；enableSellerPayment（seller 订阅支付后） | ✅ |
| tip_transactions 与帖子金额/用户一致 | process-tip-payment 写 tip_transactions + 更新 posts.tip_amount；user-tip 仅 tip_transactions | ✅ |
| notifications 与操作一致 | 订阅激活、打赏收到均插入对应 content_key | ✅ |
| 支付异常不更新状态 | process 内校验失败或抛错则 return { success: false }，不写库 | ✅ |
| 超限打赏返回 403 | checkTipLimits 不允许时 return { success: false, error }，调用方返回 403 | ✅ |

---

## 4. 支付安全与审计

| 验证点 | 实现 | 状态 |
|--------|------|------|
| Webhook 校验签名 | Stripe constructEvent；金额与 plan/target 对应 | ✅ |
| 金额与 target/plan 对应 | 订阅：getSubscriptionPrice / 回调金额校验；打赏：会话金额与回调一致 | ✅ |
| logAudit 记录操作类型、用户、资源、金额（tip 或 plan） | subscription_payment_success（userId, resourceId, meta.amount/tier）；tip_post/tip_user（userId, resourceId, meta.amount） | ✅ |
| 不记录支付明文或敏感字段 | meta 仅 amount、currency、tier、planId 等，无卡号、token | ✅ |

---

## 5. 交叉联动

| 联动 | 实现 | 状态 |
|------|------|------|
| 支付成功 → profile subscription update → enableSellerPayment → 写通知 | processSubscriptionPayment / activatePendingSubscription：insert/update subscription → sync_profile → enableSellerPayment(seller) → notifications | ✅ |
| 打赏 → 更新帖子/用户金额 → 写通知 → 可能触发佣金 | process-tip-payment：tip_transactions + posts.tip_amount + notifications；业务侧可接佣金 | ✅ |
| Cron → subscription 过期/降级 → 禁用卖家功能 → 写通知 | subscription-lifecycle RPC；check-subscription-downgrade 提醒；sync 后 profile 反映无有效订阅 | ✅ |

---

## 6. 本次修复与变更（任务 21）

| 序号 | 问题 | 修复 |
|------|------|------|
| 1 | process-subscription-payment 无 logAudit | processSubscriptionPayment：insert 改为 .select('id').single() 取 subscriptionId；在 logPaymentSuccess 后增加 logAudit(action: 'subscription_payment_success', userId, resourceId, resourceType: 'subscription', result: 'success', meta: { subscriptionType, subscriptionTier, amount, currency })。 |
| 2 | activatePendingSubscription 无 logAudit | 在 logPaymentSuccess 后增加 logAudit(action: 'subscription_payment_success', userId: sub.user_id, resourceId: subscriptionId, resourceType: 'subscription', result: 'success', meta: { planId, subscriptionTier, amount, currency })。 |
| 3 | 打赏 logAudit action 与任务描述不一致 | process-tip-payment：action 从 process_tip_payment 改为 tip_post；meta 增加 amount。process-user-tip-payment：action 从 process_user_tip_payment 改为 tip_user；meta 增加 amount。 |

---

## 7. 已采用的正确实践（无需修改）

- **订阅**：create-pending 仅写 pending 记录；金额由 getSubscriptionPrice 计算；sync_profile_subscription_derived 统一同步 profile；seller 类型支付成功后 enableSellerPayment。
- **打赏**：黑名单、打赏方 tip 订阅、接收方 tip_enabled 与 tip 订阅、checkTipLimits 单笔/每日限制；tip_transactions 插入幂等（23505 视为成功）；帖子打赏更新 posts.tip_amount。
- **通知**：content_key、content_params 支持国际化；不记录支付明文。

---

**审计结论**：订阅与打赏从购买、支付、卖家激活、打赏流程到通知与 Cron 的端到端链路已按任务 21 要求验证；本次补充了订阅支付两处 logAudit（subscription_payment_success），并统一打赏 logAudit 为 tip_post/tip_user 及 meta.amount，满足全部验证点。
