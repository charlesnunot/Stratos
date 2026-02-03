# 推演任务 8 — 带货（Affiliate）与佣金链路审计报告

**任务名称**: Affiliate & Commission Linkage Test  
**审计日期**: 2026-01-31  
**审计状态**: ✅ 通过（已修复所有问题）

---

## 一、验证结果摘要

| 验证点 | 状态 | 说明 |
|--------|------|------|
| 推广帖创建 | ✅ | 订阅校验 + 数据关联 + 审计日志 |
| 订单支付与佣金生成 | ✅ | 佣金计算正确，通知完整 |
| Cron 任务 | ✅ | 逾期检查 + 自动扣除 + 惩罚管理 |
| 管理员结算 | ✅ | 权限校验 + 审计日志 + 通知 |

---

## 二、发现并修复的问题

### 1. admin/commissions/settle 通知硬编码中文 ✅ 已修复
**文件**: `src/app/api/admin/commissions/[id]/settle/route.ts`

**问题**: 
- "佣金已结算" 通知硬编码中文

**修复**:
- 将 `title` 改为 `'Commission Settled'`
- 将 `content` 改为英文模板
- 添加 `content_params` 包含 `amount`, `orderId`

### 2. resolve-penalty.ts 通知硬编码中文 ✅ 已修复
**文件**: `src/lib/commissions/resolve-penalty.ts`

**问题**: 
- "惩罚已解除" 通知硬编码中文

**修复**:
- 将通知改为英文 + content_key: `commission_penalty_resolved`
- 添加 `content_params` 包含 `resolvedCount`

### 3. penalty-manager.ts 缺少审计日志和通知 ✅ 已修复
**文件**: `src/lib/commissions/penalty-manager.ts`

**问题**: 
- 惩罚应用时缺少审计日志
- 卖家未收到惩罚通知

**修复**:
- 添加 `logAudit('apply_commission_penalty', ...)` 审计日志
- 添加卖家惩罚通知 (content_key: `commission_penalty_applied`)

---

## 三、链路追踪

### 1. 推广帖创建流程
```
用户访问 /affiliate/products/[id]/promote
  → 显示商品信息、佣金率
  
POST /api/affiliate/posts/create
  → 校验 affiliate 订阅 (check_subscription_status)
  → 校验商品 allow_affiliate = true
  → 创建 posts 记录 (status: 'pending')
  → 创建 affiliate_posts 记录 (post_id, product_id, affiliate_id)
  → 创建 affiliate_products 记录 (commission_rate)
  → logAudit('create_affiliate_post', ...)
  → 返回 post_id, affiliate_post_id
```

### 2. 订单支付与佣金生成流程
```
买家下单 /api/orders/create
  → 可能带 affiliate_id 或 affiliate_post_id
  → 创建订单记录
  
支付成功 (Webhook/Callback)
  → process-order-payment
    → 扣减库存
    → 更新订单状态
    → 若有 affiliate_id/affiliate_post_id:
      → calculateAndCreateCommissions()
        → 获取 affiliate_products 佣金率 (或 product.commission_rate)
        → 创建 affiliate_commissions 记录
        → 更新订单 commission_amount
        → 发送 affiliate 通知 (content_key: 'commission_pending')
        → logAudit('create_commission', ...)
```

### 3. Cron 任务流程
```
[check-overdue-commissions] 每日执行
  → checkAndApplyPenalties()
    → 查找 status='pending' 且 due_date 已过的义务
    → 根据惩罚历史确定惩罚级别
    → 调用 apply_commission_penalty()
    → 更新义务状态为 'overdue'
    → logAudit('apply_commission_penalty', ...)
    → 发送卖家惩罚通知

[deduct-overdue-commissions] 每日 03:00
  → 查找 status='overdue' 的义务
  → 调用 deduct_commission_from_deposit()
  → resolveCommissionPenalty()
    → 解除惩罚
    → 发送惩罚解除通知
  → 记录 cron_logs
```

### 4. 管理员结算流程
```
POST /api/admin/commissions/[id]/settle
  → requireAdmin
  → 校验佣金状态为 'pending'
  → 更新状态为 'paid', 设置 paid_at
  → logAudit('admin_commission_settle', ...)
  → 发送 affiliate 通知 (content_key: 'commission_settled')
```

---

## 四、权限校验验证

### 推广帖创建
| 检查项 | 位置 | 状态 |
|--------|------|------|
| affiliate 订阅有效 | check_subscription_status | ✅ |
| 商品允许带货 | product.allow_affiliate | ✅ |

### 佣金结算
| 检查项 | 位置 | 状态 |
|--------|------|------|
| requireAdmin | settle/route.ts | ✅ |
| 佣金状态为 pending | settle/route.ts | ✅ |

### 惩罚管理
| 检查项 | 位置 | 状态 |
|--------|------|------|
| 卖家拥有逾期义务 | penalty-manager.ts | ✅ |
| 惩罚等级递进 | warning → restrict_sales → suspend → disable | ✅ |

---

## 五、审计日志完整性

| 操作 | 位置 | action | 状态 |
|------|------|--------|------|
| 创建推广帖 | affiliate/posts/create | create_affiliate_post | ✅ |
| 创建佣金 | calculate.ts | create_commission | ✅ |
| 应用惩罚 | penalty-manager.ts | apply_commission_penalty | ✅ |
| 管理员结算 | settle/route.ts | admin_commission_settle | ✅ |

---

## 六、通知机制验证

| 事件 | 通知对象 | content_key | 状态 |
|------|----------|-------------|------|
| 佣金生成 | affiliate | commission_pending | ✅ |
| 佣金结算 | affiliate | commission_settled | ✅ |
| 惩罚应用 | seller | commission_penalty_applied | ✅ |
| 惩罚解除 | seller | commission_penalty_resolved | ✅ |

---

## 七、佣金计算验证

### 佣金率优先级
1. `affiliate_products.commission_rate` (特定推广者+商品+帖子)
2. `products.commission_rate` (商品默认佣金率)

### 计算公式
```
commission_amount = item_total * commission_rate / 100
```

### 支持场景
- ✅ 单商品订单 (legacy: order.product_id)
- ✅ 多商品订单 (order_items)
- ✅ affiliate_post_id 精确匹配
- ✅ affiliate_id 通用匹配

---

## 八、惩罚等级验证

| 等级 | 名称 | 操作 | 状态 |
|------|------|------|------|
| 1 | warning | 发送警告通知 | ✅ |
| 2 | restrict_sales | 禁止创建新商品 | ✅ |
| 3 | suspend | 设置 role = 'seller_suspended' | ✅ |
| 4 | disable | 移除卖家角色, 隐藏所有商品 | ✅ |

---

## 九、修改文件清单

1. `src/app/api/admin/commissions/[id]/settle/route.ts` - 国际化通知
2. `src/lib/commissions/resolve-penalty.ts` - 国际化通知
3. `src/lib/commissions/penalty-manager.ts` - 审计日志 + 惩罚通知
4. `docs/affiliate-commission-linkage-audit.md` - 审计报告

---

## 十、架构亮点

1. **双重佣金率支持**: affiliate_products 特定费率优先于商品默认费率
2. **递进式惩罚**: 四级惩罚体系确保逐步升级
3. **自动扣除机制**: Cron 从保证金自动扣除逾期佣金
4. **审计日志完整**: 推广帖、佣金、惩罚均有记录
5. **通知完整**: affiliate 和 seller 均收到相关通知

---

## 十一、结论

带货与佣金链路审计完成，所有验证点均通过：

1. **推广帖创建** - 订阅校验严格，数据关联正确
2. **订单支付与佣金生成** - 佣金计算正确，通知完整
3. **Cron 任务** - 逾期检查和自动扣除逻辑正确
4. **管理员结算** - 权限校验通过，审计日志完整
5. **国际化** - 所有硬编码中文通知已替换
6. **惩罚通知** - 卖家现在收到惩罚应用和解除通知

链路完整，带货与佣金端到端可追溯，无安全漏洞。
