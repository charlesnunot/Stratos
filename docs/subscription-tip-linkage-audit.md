# 推演任务 6 — 订阅与打赏链路审计报告

**任务名称**: Subscription & Tip Linkage Test  
**审计日期**: 2026-01-31  
**审计状态**: ✅ 通过（已修复所有问题）

---

## 一、验证结果摘要

| 验证点 | 状态 | 说明 |
|--------|------|------|
| 订阅创建与支付 | ✅ | pending → active 流程完整 |
| 帖子打赏 | ✅ | 权限校验、记录、通知完整 |
| UserTip | ✅ | 直接打赏用户流程完整 |
| 审计日志 | ✅ | 关键操作均有记录 |
| Cron 与提醒 | ✅ | 生命周期、到期提醒、降级检查 |

---

## 二、发现并修复的问题

### 1. process-subscription-payment 通知硬编码中文 ✅ 已修复
**文件**: `src/lib/payments/process-subscription-payment.ts`

**问题**: 
- "订阅激活成功", "卖家订阅", "带货者订阅", "打赏功能订阅" 硬编码

**修复**:
- 将 `title` 改为英文 `'Subscription Activated'`
- 将 `content` 改为英文模板
- 添加 `content_params` 包含 `subscriptionType`, `subscriptionTier`

### 2. process-tip-payment 通知硬编码中文与审计日志 ✅ 已修复
**文件**: `src/lib/payments/process-tip-payment.ts`

**问题**: 
- "收到打赏" 通知硬编码中文
- 缺少审计日志

**修复**:
- 将通知改为英文 + content_key
- 添加 `logAudit('process_tip_payment', ...)` 审计日志

### 3. process-user-tip-payment 通知硬编码中文与审计日志 ✅ 已修复
**文件**: `src/lib/payments/process-user-tip-payment.ts`

**问题**: 
- "收到打赏" 通知硬编码中文
- 缺少审计日志
- 缺少 `link` 字段

**修复**:
- 将通知改为英文 + content_key: `user_tip_received`
- 添加 `link: /user/${recipientId}`
- 添加 `logAudit('process_user_tip_payment', ...)` 审计日志

### 4. TipButton 组件硬编码中文消息 ✅ 已修复
**文件**: `src/components/social/TipButton.tsx`

**问题**: 多处硬编码中文消息

**修复**:
- "加载中..." → `tCommon('loading')`
- "提示" → `tCommon('notice')`
- "错误" → `tCommon('error')`
- "成功" → `tCommon('success')`
- "最小打赏金额" → `t('minimumTipAmount')`
- "请输入打赏金额" → `t('enterAmount')`
- 错误消息映射到 i18n 键

新增翻译键：
- `minimumTipAmount`
- `tipSubscriptionExpired`
- `tipSubscriptionRequired`
- `tipLimitExceeded`

### 5. check-subscription-downgrade Cron 通知硬编码中文 ✅ 已修复
**文件**: `src/app/api/cron/check-subscription-downgrade/route.ts`

**问题**: 
- "订阅档位提醒" 通知硬编码中文

**修复**:
- 将通知改为英文 + content_key: `subscription_tier_exceeded`
- 添加 `content_params` 包含 `unfilledTotal`, `currentTier`, `suggestedTier`

---

## 三、链路追踪

### 1. 订阅创建流程
```
用户访问 /subscription/seller (或 affiliate/tip)
  → 选择套餐和支付方式
  
[Alipay/WeChat/Bank 支付方式]
  → POST /api/subscriptions/create-pending
    → 验证订阅类型、档位
    → 计算价格（后端计算，不信任前端）
    → 创建 status='pending' 的订阅记录
    → logAudit('create_pending_subscription', ...)
    → 返回 subscriptionId
  → POST /api/subscriptions/create-payment
    → 创建 Alipay/WeChat 支付订单
    → 用户完成支付
    → 回调 activatePendingSubscription()
    
[Stripe/PayPal 支付方式]
  → POST /api/payments/stripe/create-checkout-session (type: subscription)
    → 创建 Stripe Checkout Session
    → 用户完成支付
    → Webhook 回调 processSubscriptionPayment()
```

### 2. 订阅支付处理流程
```
processSubscriptionPayment() / activatePendingSubscription()
  → 创建/激活订阅记录
  → 同步 profile (sync_profile_subscription_derived)
    → 更新 subscription_type
    → 更新 subscription_expires_at
    → 更新 seller_subscription_tier
    → 更新 tip_enabled
    → 更新 role (seller/affiliate)
  → 卖家订阅：enableSellerPayment()
  → 发送订阅激活通知
  → logPaymentSuccess()
```

### 3. 帖子打赏流程
```
用户点击帖子打赏按钮 (TipButton)
  → 检查 tip_enabled && tipSubscription
  → 输入金额，选择支付方式
  
[Stripe]
  → POST /api/payments/stripe/create-tip-session
    → 验证打赏者订阅
    → 验证接收者 tip_enabled && 订阅
    → 检查黑名单
    → 检查打赏限制
    → 创建 Stripe Checkout Session
  → 用户完成支付
  → Webhook 回调 processTipPayment()
    → 再次验证（黑名单、订阅、限制）
    → 创建 tip_transactions 记录
    → 更新帖子 tip_amount
    → 转账给接收者（如支持）
    → 发送打赏通知
    → logAudit('process_tip_payment', ...)
```

### 4. 用户打赏流程 (UserTip)
```
用户点击用户打赏按钮 (UserTipButton)
  → POST /api/payments/stripe/create-user-tip-session
    → 验证打赏者订阅
    → 验证接收者 tip_enabled && 订阅
    → 检查黑名单
    → 检查打赏限制
    → 创建 Stripe Checkout Session (type: user_tip)
  → 用户完成支付
  → Webhook 回调 processUserTipPayment()
    → 再次验证
    → 创建 tip_transactions 记录（post_id = null）
    → 发送打赏通知
    → logAudit('process_user_tip_payment', ...)
```

### 5. 订阅生命周期 Cron
```
[subscription-lifecycle] 每日执行
  → 调用 expire_subscriptions_and_sync_profiles()
  → 将过期订阅状态更新为 'expired'
  → 同步受影响用户的 profile
  → 记录 cron_logs

[subscription-expiry-reminders] 每日执行
  → 调用 send_subscription_expiry_reminders()
  → 发送到期前 3 天和 1 天提醒
  → 去重处理

[check-subscription-downgrade] 每日执行
  → 检查卖家未完成订单是否超过订阅档位
  → 如超过，发送升级提醒通知
  → 7 天内不重复通知
```

---

## 四、Profile 同步机制验证

### 订阅状态同步
```sql
-- sync_profile_subscription_derived(p_user_id) 函数
-- 从 subscriptions 表计算并同步到 profiles 表

-- 同步字段：
-- subscription_type: 最高优先级的活跃订阅类型
-- subscription_expires_at: 最远的到期时间
-- seller_subscription_tier: 卖家订阅档位
-- tip_enabled: 是否有活跃打赏订阅
-- role: 根据订阅类型更新角色
```

### 调用时机
- ✅ 订阅支付成功后
- ✅ 待支付订阅激活后
- ✅ 订阅过期 Cron 任务中

---

## 五、权限校验验证

### 打赏权限校验
| 检查项 | 位置 | 状态 |
|--------|------|------|
| 打赏者 tip_enabled | checkTipEnabled() | ✅ |
| 打赏者 tip 订阅有效 | process-tip-payment.ts | ✅ |
| 接收者 tip_enabled | process-tip-payment.ts | ✅ |
| 接收者 tip 订阅有效 | process-tip-payment.ts | ✅ |
| 黑名单检查 | process-tip-payment.ts | ✅ |
| 打赏限制 | checkTipLimits() | ✅ |

### 订阅权限校验
| 检查项 | 位置 | 状态 |
|--------|------|------|
| 订阅类型有效 | create-pending/route.ts | ✅ |
| 支付方式有效 | create-pending/route.ts | ✅ |
| 订阅档位有效 | create-pending/route.ts | ✅ |
| 金额后端计算 | create-pending/route.ts | ✅ |

---

## 六、审计日志完整性

| 操作 | 位置 | 记录内容 | 状态 |
|------|------|----------|------|
| 创建待支付订阅 | create-pending/route.ts | userId, subscriptionId, result | ✅ |
| 订阅支付成功 | process-subscription-payment.ts | logPaymentSuccess() | ✅ |
| 帖子打赏处理 | process-tip-payment.ts | userId, postId, recipientId | ✅ |
| 用户打赏处理 | process-user-tip-payment.ts | userId, recipientId | ✅ |
| 订阅降级检查 | check-subscription-downgrade | cron_logs 表 | ✅ |

---

## 七、通知机制验证

| 事件 | 通知对象 | content_key | 状态 |
|------|----------|-------------|------|
| 订阅激活 | 用户 | subscription_renewed | ✅ |
| 帖子打赏 | 接收者 | tip_received | ✅ |
| 用户打赏 | 接收者 | user_tip_received | ✅ |
| 订阅档位提醒 | 卖家 | subscription_tier_exceeded | ✅ |
| 订阅到期提醒 | 用户 | 数据库函数处理 | ✅ |

---

## 八、修改文件清单

1. `src/lib/payments/process-subscription-payment.ts` - 国际化通知
2. `src/lib/payments/process-tip-payment.ts` - 国际化通知 + 审计日志
3. `src/lib/payments/process-user-tip-payment.ts` - 国际化通知 + 审计日志 + link
4. `src/components/social/TipButton.tsx` - 国际化消息
5. `src/app/api/cron/check-subscription-downgrade/route.ts` - 国际化通知
6. `src/messages/zh.json` - 新增 4 个翻译键
7. `src/messages/en.json` - 新增 4 个翻译键

---

## 九、架构亮点

1. **单一事实来源**: subscriptions 表是订阅状态的唯一事实来源，profile 通过 sync 函数同步
2. **后端价格计算**: create-pending 不信任前端传入的金额，后端重新计算
3. **多层权限校验**: 打赏在创建会话和处理支付时都进行权限验证
4. **Cron 自动化**: 订阅生命周期、到期提醒、降级检查自动执行
5. **幂等性保障**: 重复回调安全处理

---

## 十、结论

订阅与打赏链路审计完成，所有验证点均通过：

1. **订阅创建与支付** - pending → active 流程完整，profile 自动同步
2. **帖子打赏** - 权限校验严格，记录和通知完整
3. **用户打赏** - 直接打赏流程完整，审计日志已添加
4. **审计日志** - 关键操作均有记录
5. **Cron 与提醒** - 生命周期管理完善，通知国际化
6. **国际化** - 所有硬编码中文消息已替换为翻译键

链路完整，订阅与打赏端到端可追溯，无安全漏洞。
