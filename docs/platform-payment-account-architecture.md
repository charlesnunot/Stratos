# 平台官方收款账户架构文档

## 一、核心设计原则

### 1.1 平台账户的定义

**平台官方收款账户（Platform Merchant Account）**是平台唯一的、中心化的收款账户，在法律和资金上是一个独立的收款主体。

**关键特征**：
- ✅ 唯一性：每种支付方式只能有一个平台账户
- ✅ 中心化：所有平台收入统一进入此账户
- ✅ 独立性：与卖家收款账户完全分离
- ✅ 法律合规：符合第三方支付平台要求

### 1.2 平台账户 vs 卖家账户

| 特征 | 平台账户 | 卖家账户 |
|------|---------|---------|
| 账户类型 | Platform Merchant Account | Seller Payment Account |
| 数据模型 | `is_platform_account = true` | `is_platform_account = false` |
| seller_id | NULL | 卖家用户ID |
| 数量限制 | 每种支付方式1个 | 每个卖家可多个 |
| 用途 | 平台收入、风控资金 | 商品货款收款 |

## 二、资金流向设计

### 2.1 平台账户负责的资金类型

| 资金类型 | 流向 | 说明 | 代码位置 |
|---------|------|------|---------|
| **订阅费用** | 用户 → 平台账户 | 平台服务收入 | `create-checkout-session`（无destinationAccountId） |
| **卖家保证金** | 卖家 → 平台账户 | 风控资金（冻结/标记） | `deposits/pay`（无destinationAccountId） |
| **平台服务费** | 用户 → 平台账户 | 平台收入 | （待实现） |
| **违规扣款** | 从保证金中扣 | 从平台账户的保证金中扣除 | （待实现） |
| **技术服务费** | B端 → 平台账户 | B端收费 | （待实现） |

### 2.2 平台账户不负责的资金类型

| 资金类型 | 流向 | 原因 | 代码位置 |
|---------|------|------|---------|
| **商品货款** | 买家 → 卖家账户 | 法律风险 + 税务风险 | `create-order-checkout-session`（有destinationAccountId） |
| **买家付款给卖家** | 买家 → 卖家账户 | 应直付卖家或托管 | Stripe Connect destination charges |

### 2.3 为什么平台不能代收货款？

**法律风险**：
- 代收货款 = 资金池
- 涉及非法吸收公众存款
- 第三方支付牌照问题
- 跨境合规风险

**技术复杂度**：
- 分账逻辑复杂
- 账期管理
- 税务处理
- 对账困难
- 纠纷冻结

**合规要求**：
- 除非使用 Stripe Connect
- 或使用支付宝分账
- 或使用微信服务商模式
- 这些是 V2/V3 级别平台的功能

## 三、技术实现

### 3.1 数据模型

**payment_accounts 表结构**：

```sql
CREATE TABLE payment_accounts (
  id UUID PRIMARY KEY,
  seller_id UUID REFERENCES profiles(id), -- NULL for platform accounts
  account_type TEXT, -- 'stripe', 'paypal', 'alipay', 'wechat', 'bank'
  is_platform_account BOOLEAN DEFAULT false,
  account_info JSONB, -- 账户配置信息
  currency TEXT,
  supported_currencies TEXT[],
  is_verified BOOLEAN,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')), -- ⭐ 状态字段
  disabled_at TIMESTAMPTZ, -- ⭐ 停用时间
  disabled_by UUID REFERENCES profiles(id), -- ⭐ 停用操作人
  enabled_at TIMESTAMPTZ, -- ⭐ 启用时间
  enabled_by UUID REFERENCES profiles(id), -- ⭐ 启用操作人
  ...
);

-- 约束：平台账户必须 seller_id 为 NULL
CHECK (
  (is_platform_account = true AND seller_id IS NULL) OR
  (is_platform_account = false AND seller_id IS NOT NULL)
);

-- 唯一约束：每种支付方式只能有一个活跃平台账户
-- ⭐ 只对 status = 'active' 的账户应用唯一性约束
CREATE UNIQUE INDEX idx_platform_payment_account_unique_active
  ON payment_accounts(account_type) 
  WHERE is_platform_account = true AND status = 'active';
```

### 3.2 平台账户获取函数

```sql
CREATE OR REPLACE FUNCTION get_platform_payment_account(
  p_currency TEXT,
  p_account_type TEXT
)
RETURNS TABLE (
  id UUID,
  account_type TEXT,
  currency TEXT,
  account_info JSONB,
  is_verified BOOLEAN,
  supported_currencies TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.account_type,
    pa.currency,
    pa.account_info,
    pa.is_verified,
    pa.supported_currencies
  FROM payment_accounts pa
  WHERE pa.is_platform_account = true
    AND pa.account_type = p_account_type
    AND pa.is_verified = true
    AND pa.status = 'active'  -- ⭐ 只返回活跃账户
    AND (
      pa.currency = p_currency 
      OR p_currency = ANY(pa.supported_currencies)
    )
  ORDER BY 
    CASE WHEN pa.currency = p_currency THEN 0 ELSE 1 END,
    pa.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.3 支付库优先级

所有支付库（Stripe、PayPal、Alipay、WeChat）都遵循相同的优先级：

1. **数据库平台账户配置**（优先）
   - 调用 `get_platform_payment_account()` 函数
   - 从 `payment_accounts` 表获取平台账户配置

2. **环境变量**（fallback）
   - 如果数据库中没有平台账户配置，使用环境变量
   - 例如：`STRIPE_SECRET_KEY`、`PAYPAL_CLIENT_ID` 等

**代码示例**（Stripe）：

```typescript
// src/lib/payments/stripe.ts
async function getPlatformStripeConfig(currency: string = 'USD'): Promise<{ secretKey: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_platform_payment_account', {
    p_currency: currency,
    p_account_type: 'stripe',
  })
  // ... 返回配置或 null
}

async function getStripeClient(currency?: string): Promise<Stripe> {
  // 1. 优先从数据库获取平台账户配置
  let secretKey: string | null = null
  if (currency) {
    const platformConfig = await getPlatformStripeConfig(currency)
    if (platformConfig) {
      secretKey = platformConfig.secretKey
    }
  }
  
  // 2. Fallback 到环境变量
  if (!secretKey) {
    secretKey = process.env.STRIPE_SECRET_KEY || null
  }
  
  // 3. 创建 Stripe 客户端
  // ...
}
```

## 四、资金流向验证

### 4.1 订阅支付流向

**API**: `POST /api/payments/stripe/create-checkout-session`

**代码位置**: `src/app/api/payments/stripe/create-checkout-session/route.ts`

**验证**：
```typescript
const session = await createCheckoutSession(
  numericAmount,
  successUrl,
  cancelUrl,
  {
    userId: userId || user.id,
    subscriptionType: subscriptionType,
    subscriptionTier: subscriptionTier?.toString(),
    type: 'subscription',
  },
  currency
  // ❌ 没有传递 destinationAccountId
)
```

**结果**：✅ 订阅费用进入平台账户

### 4.2 保证金支付流向

**API**: `POST /api/deposits/pay`

**代码位置**: `src/app/api/deposits/pay/route.ts`

**验证**：
```typescript
const session = await createCheckoutSession(
  numericAmount,
  successUrl,
  cancelUrl,
  {
    userId: user.id,
    depositLotId: depositLotId,
    type: 'deposit',
  },
  currency.toLowerCase()
  // ❌ 没有传递 destinationAccountId
)
```

**结果**：✅ 保证金进入平台账户（冻结/标记）

### 4.3 订单支付流向（买家直付模型）

**API**: `POST /api/payments/stripe/create-order-checkout-session`

**代码位置**: `src/app/api/payments/stripe/create-order-checkout-session/route.ts`

**验证**：
```typescript
// 获取卖家 Stripe Connect 账户ID
const sellerAccountId = sellerProfile.payment_account_id

// 创建 checkout session，传递 destinationAccountId
const session = await createCheckoutSession(
  order.total_amount,
  successUrl,
  cancelUrl,
  {
    userId: user.id,
    orderId: orderId,
    type: 'order',
  },
  existingOrder?.currency || 'usd',
  sellerAccountId // ✅ 传递了 destinationAccountId
)
```

**Stripe Connect 实现**：
```typescript
// src/lib/payments/stripe.ts
if (destinationAccountId) {
  sessionParams.payment_intent_data = {
    on_behalf_of: destinationAccountId, // 卖家账户
    transfer_data: {
      destination: destinationAccountId, // 直接转账给卖家，资金不经过平台
    },
  }
}
```

**结果**：✅ 商品货款直接进入卖家账户（买家直付模型）

## 五、平台账户管理

### 5.1 管理界面

**路径**: `/admin/platform-payment-accounts`

**代码位置**: `src/app/[locale]/(main)/admin/platform-payment-accounts/page.tsx`

**功能**：
- 查看所有平台账户（包括停用账户）
- 创建平台账户
- 编辑平台账户
- **启用/停用平台账户**（软停用机制，不物理删除）
- 支持 Stripe、PayPal、支付宝、微信支付
- 显示账户状态（活跃/停用）
- 显示停用/启用时间和操作人（审计信息）

### 5.2 管理API

**路径**: `/api/admin/platform-payment-accounts`

**代码位置**: `src/app/api/admin/platform-payment-accounts/route.ts`

**功能**：
- `GET`: 获取所有平台账户（包括停用账户）
- `POST`: 创建平台账户（默认状态为 'active'）
- `PUT`: 更新平台账户信息
- `PATCH`: **更新账户状态**（启用/停用，替代原来的 DELETE）

**约束**：
- 每种支付方式只能有一个**活跃**平台账户
- 允许存在多个停用的账户（用于审计和灰度切换）
- 平台账户的 `seller_id` 必须为 NULL
- 平台账户自动设置为 `is_verified = true`
- 新创建的账户默认状态为 'active'

### 5.3 软停用机制 ⭐

**重要改进**：禁止物理删除平台账户，改为软停用机制。

**状态字段**：
- `status`: 'active' | 'disabled'
- `disabled_at`: 停用时间戳
- `disabled_by`: 停用操作人ID
- `enabled_at`: 启用时间戳
- `enabled_by`: 启用操作人ID

**优势**：
- ✅ **灰度切换**：可以创建新账户并停用旧账户，实现平滑切换
- ✅ **审计回溯**：保留所有历史配置，便于问题排查
- ✅ **避免误删**：停用可以恢复，删除不可恢复
- ✅ **密钥安全**：密钥信息永久保留，不会丢失
- ✅ **灵活管理**：可以临时停用账户进行维护，无需删除重建

**唯一性约束**：
- 唯一索引只对 `status = 'active'` 的账户生效
- 允许存在多个 `status = 'disabled'` 的账户
- 启用账户时会检查是否已有其他活跃账户

## 六、保证金管理

### 6.1 保证金的性质

保证金不是平台收入，而是**风控资金**：

- ❌ 不自动转走
- ❌ 不参与平台营收
- ✅ 可用于赔付/扣罚
- ✅ 可在退出卖家时退款

### 6.2 保证金流程

1. **缴纳保证金**：
   - 卖家 → 平台账户（通过 `deposits/pay` API）
   - 创建 `seller_deposit_lots` 记录
   - 状态：`required` → `paid`

2. **使用保证金**：
   - 违规扣款：从保证金中扣除
   - 赔付买家：从保证金中扣除
   - （待实现）

3. **退还保证金**：
   - 卖家退出时：退还剩余保证金
   - （待实现）

## 七、最佳实践

### 7.1 订阅支付

✅ **正确做法**：
```typescript
// 订阅支付：不传递 destinationAccountId
await createCheckoutSession(amount, successUrl, cancelUrl, metadata, currency)
```

❌ **错误做法**：
```typescript
// 订阅支付：不应该传递 destinationAccountId
await createCheckoutSession(amount, successUrl, cancelUrl, metadata, currency, sellerAccountId)
```

### 7.2 订单支付

✅ **正确做法**：
```typescript
// 订单支付：必须传递 destinationAccountId（卖家账户）
await createCheckoutSession(amount, successUrl, cancelUrl, metadata, currency, sellerAccountId)
```

❌ **错误做法**：
```typescript
// 订单支付：不应该不传递 destinationAccountId（会导致资金进入平台账户）
await createCheckoutSession(amount, successUrl, cancelUrl, metadata, currency)
```

### 7.3 保证金支付

✅ **正确做法**：
```typescript
// 保证金支付：不传递 destinationAccountId
await createCheckoutSession(amount, successUrl, cancelUrl, metadata, currency)
```

## 八、总结

### 8.1 架构优势

1. **法律合规**：平台不代收货款，避免资金池风险
2. **税务清晰**：平台收入和商品货款分离，税务处理简单
3. **技术简洁**：买家直付模型，无需复杂分账逻辑
4. **扩展性好**：未来可支持 Stripe Connect、支付宝分账等高级功能

### 8.2 资金流向总结

```
订阅费用     → 平台账户 ✅
保证金       → 平台账户 ✅
平台服务费   → 平台账户 ✅（待实现）
违规扣款     → 从保证金中扣 ✅（待实现）
商品货款     → 卖家账户 ✅（买家直付模型）
```

### 8.3 关键文件清单

- **数据库迁移**: 
  - `supabase/migrations/117_support_platform_payment_accounts.sql` - 初始平台账户支持
  - `supabase/migrations/139_add_platform_account_status.sql` - ⭐ 状态字段和软停用机制
- **平台账户管理**: `src/app/api/admin/platform-payment-accounts/`
- **平台账户获取**: `src/lib/payments/stripe.ts` → `getPlatformStripeConfig()`
- **订阅支付**: `src/app/api/payments/stripe/create-checkout-session/route.ts`
- **订单支付**: `src/app/api/payments/stripe/create-order-checkout-session/route.ts`
- **保证金支付**: `src/app/api/deposits/pay/route.ts`

### 8.4 软停用机制说明

**实施时间**: 2026-01-24

**改进内容**：
- 添加 `status` 字段（'active' | 'disabled'）
- 添加审计字段（disabled_at, disabled_by, enabled_at, enabled_by）
- 将 DELETE 接口改为 PATCH 接口（状态切换）
- 更新唯一索引：只对活跃账户应用唯一性约束
- 更新 `get_platform_payment_account()` 函数：只返回活跃账户
- 前端界面：删除按钮改为停用/启用按钮

**运维优势**：
- 支持灰度切换（创建新账户 → 停用旧账户）
- 保留审计历史（所有配置和操作记录）
- 避免误删密钥（停用可恢复，删除不可恢复）
- 灵活管理（临时停用维护，无需删除重建）
