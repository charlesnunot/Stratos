---
name: "stratos-project"
description: "Stratos social e-commerce platform context. Invoke when working on Next.js 14, Supabase, i18n, payments, or social commerce features."
---

# Stratos Project - 完整开发指南

## 项目概述

Stratos 是一个**社交电商平台**，融合了社交媒体功能与电商交易系统。平台支持多语言（中英文）、多币种支付、商品管理、订单处理、即时通讯等完整功能。

### 核心定位
- **社交电商**: 用户可以关注、点赞、评论、转发商品和帖子
- **C2C 交易**: 用户既是买家也是卖家
- **多支付渠道**: Stripe、PayPal、支付宝、微信支付、银行转账
- **国际化**: 完整的中英文支持，自动翻译功能

---

## 功能模块全览

### 1. 用户与认证模块

| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 注册/登录 | `/login`, `/register` | `auth.users` | `app/(auth)/*` |
| 密码重置 | `/forgot-password` | `auth.users` | `app/(auth)/forgot-password/page.tsx` |
| 用户资料 | `/profile/[id]` | `profiles` | `app/(main)/profile/[id]/page.tsx` |
| 身份认证 | `/settings` | `identity_verifications` | `app/api/identity-verification/route.ts` |
| 账户注销 | `/settings` | `account_deletion_requests` | `app/api/account/delete/route.ts` |

**联动链路**:
```
登录/注册 → Supabase Auth → /api/auth/callback → middleware updateSession → useAuth Hook
```

### 2. 内容模块

#### 2.1 帖子 (Posts)
| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 创建帖子 | `/post/create` | `posts`, `post_topics` | `app/(main)/post/create/page.tsx` |
| 帖子列表 | `/feed` | `posts` | `app/(main)/feed/page.tsx` |
| 帖子详情 | `/post/[id]` | `posts`, `comments` | `app/post/[id]/page.tsx` |
| 编辑帖子 | `/post/[id]/edit` | `posts` | `app/(main)/post/[id]/edit/page.tsx` |
| 删除帖子 | 帖子菜单 | `posts` | `lib/hooks/usePosts.ts` |

**联动链路**:
```
创建帖子 → status=pending → Admin审核 → AI翻译/话题提取 → 通知关注者
编辑帖子 → 更新内容 → 重新审核 → 同步翻译
删除帖子 → 软删除 → 清理关联数据 → 更新计数
```

#### 2.2 商品 (Products)
| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 创建商品 | `/seller/products/create` | `products` | `app/(main)/seller/products/create/page.tsx` |
| 商品列表 | `/products` | `products` | `app/(main)/products/page.tsx` |
| 商品详情 | `/product/[id]` | `products` | `app/(main)/product/[id]/page.tsx` |
| 编辑商品 | `/seller/products/edit/[id]` | `products` | `app/(main)/seller/products/edit/[id]/page.tsx` |

**商品状态流转**:
```
创建 → pending → Admin审核 → active → sold_out/inactive
  ↓       ↓         ↓          ↓
编辑    拒绝     上架销售    库存管理
```

### 3. 社交互动模块

| 功能 | 入口 | 核心表 | 联动效果 |
|------|------|--------|----------|
| 关注 | FollowButton | `follows` | 计数+1, 通知被关注者 |
| 点赞 | LikeButton | `likes` | like_count+1, 通知作者 |
| 收藏 | FavoriteButton | `favorites` | favorite_count+1 |
| 转发 | RepostDialog | `reposts` | repost_count+1, 通知作者 |
| 分享 | ShareDialog | `shares` | share_count+1 |
| 评论 | CommentSection | `comments` | comment_count+1, 通知作者 |
| 举报 | ReportDialog | `reports` | Admin审核, 通知处理结果 |

**限流保护**:
- DB trigger: `enforce_like_rate_limit`, `enforce_follow_rate_limit`
- 前端防抖: 300ms (LikeButton), 2s (话题提取)

### 4. 电商订单模块

#### 4.1 购物车系统

**技术架构**:
- **状态管理**: Zustand + persist中间件（本地存储）
- **数据验证**: 结算时实时验证商品状态
- **多规格支持**: 支持颜色、尺寸等SKU变体

**购物车数据结构**:
```typescript
interface CartItem {
  product_id: string      // 商品ID
  quantity: number        // 数量
  price: number          // 单价（下单时快照）
  currency?: string      // 货币
  name: string           // 商品名称
  image: string          // 商品图片
  color?: string | null  // 颜色规格
  size?: string | null   // 尺寸规格
}
```

**核心功能**:
| 功能 | 入口 | 核心逻辑 | 关键文件 |
|------|------|---------|----------|
| 添加商品 | 商品详情页 | 同规格合并数量，新规格新增条目 | `store/cartStore.ts` |
| 查看购物车 | `/cart` | 列表展示、选择/全选、价格计算 | `app/(main)/cart/page.tsx` |
| 修改数量 | 购物车页 | 实时更新数量，验证库存 | `components/ecommerce/ShoppingCart.tsx` |
| 删除商品 | 购物车页 | 支持单删、批量删除选中项 | `store/cartStore.ts` |
| 商品验证 | 结算时 | 检查库存、价格变动、商品状态 | `cartStore.validateItems()` |

**变体处理逻辑**:
```typescript
// 判断是否为同一SKU（product_id + color + size）
function isSameVariant(a, b): boolean {
  return a.product_id === b.product_id &&
    (a.color ?? null) === (b.color ?? null) &&
    (a.size ?? null) === (b.size ?? null)
}
```

**结算验证流程**:
```
点击结算 → 验证选中商品 → 调用validateItems()
  ↓
检查库存是否充足
检查商品是否下架
检查价格是否变动
  ↓
验证通过 → 跳转/checkout
验证失败 → 提示用户更新购物车
```

#### 4.2 订单系统

**订单创建流程**:
```
购物车选择商品 → /checkout → 填写地址 → 创建订单 → 跳转支付
      ↓                ↓           ↓            ↓
  多卖家拆单      选择收货地址   库存预占    生成order_number
  Affiliate追踪   运费计算      价格快照    状态=pending
```

**多卖家订单处理**:
- 一个购物车结算可能包含多个卖家的商品
- 系统自动按卖家拆分为多个独立订单
- 每个订单独立支付、独立物流、独立评价

**订单状态流转**:
```
pending (待支付) → paid (已支付) → shipped (已发货) → completed (已完成)
     ↓                  ↓                ↓
  30分钟超时        卖家发货         自动确认(7天)
  自动取消          物流单号         买家手动确认
     ↓                  ↓                ↓
cancelled (已取消)  dispute (纠纷中)  refund (已退款)
```

**状态说明**:
| 状态 | 说明 | 可执行操作 |
|------|------|-----------|
| `pending` | 待支付，库存已预占 | 支付、取消 |
| `paid` | 已支付，等待发货 | 发货、申请退款 |
| `shipped` | 已发货，运输中 | 确认收货、查看物流 |
| `completed` | 已完成，交易成功 | 评价、售后 |
| `cancelled` | 已取消，库存释放 | - |
| `in_dispute` | 纠纷处理中 | 提交证据、等待仲裁 |
| `refunded` | 已退款 | - |

**订单核心功能**:
| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 创建订单 | `/checkout` | `orders`, `order_items` | `app/api/orders/create/route.ts` |
| 支付订单 | `/orders/[id]/pay` | `orders`, `payment_transactions` | `app/api/payments/*/route.ts` |
| 卖家发货 | 卖家中心 | `orders` | `app/api/orders/[id]/ship/route.ts` |
| 确认收货 | 订单详情 | `orders` | `app/api/orders/[id]/confirm-receipt/route.ts` |
| 取消订单 | 订单详情 | `orders` | `app/api/orders/[id]/cancel/route.ts` |
| 申请纠纷 | 订单详情 | `order_disputes` | `app/api/orders/[id]/dispute/route.ts` |
| 评价订单 | `/orders/[id]/feedback` | `seller_feedback` | `app/api/orders/[id]/feedback/route.ts` |

**订单表结构**:
```sql
orders (
  id UUID PRIMARY KEY,
  order_number TEXT UNIQUE,           -- 订单号 (如: ORD20250210001)
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  order_status TEXT,                  -- pending/paid/shipped/completed/cancelled/refunded/in_dispute
  total_amount DECIMAL(10,2),         -- 订单总金额
  currency VARCHAR(3),                -- 货币
  shipping_address JSONB,             -- 收货地址快照
  shipping_fee DECIMAL(10,2),         -- 运费
  affiliate_post_id UUID,             -- 关联的推广帖
  seller_type_snapshot TEXT,          -- 下单时卖家类型快照
  funds_recipient TEXT,               -- 资金流向 (platform/seller)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

order_items (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER,
  unit_price DECIMAL(10,2),           -- 下单时单价快照
  color TEXT,
  size TEXT,
  created_at TIMESTAMPTZ
)
```

**定时任务**:
| 任务 | 频率 | 功能 | 文件 |
|------|------|------|------|
| 取消过期订单 | 每小时 | 取消30分钟未支付的pending订单 | `app/api/cron/cancel-expired-orders/route.ts` |
| 自动确认收货 | 每天 | 发货7天后自动确认收货 | `app/api/cron/auto-close-tickets/route.ts` |
| 保证金自动恢复 | 订单完成时 | 检查并恢复卖家保证金额度 | `lib/orders/auto-recovery.ts` |
| 发货超时检查 | 每天 | 标记超时未发货订单 | `app/api/cron/check-shipping-timeout/route.ts` |
| 发货提醒 | 每天 | 提醒卖家及时发货 | `app/api/cron/send-shipping-reminders/route.ts` |

#### 4.3 订单履行（Fulfillment）系统

**履行流程**:
```
订单支付成功 (status=paid)
     ↓
卖家准备商品 → 打包 → 联系物流
     ↓
卖家在系统录入物流信息
     ↓
订单状态变为 shipped
     ↓
买家可查看物流跟踪信息
     ↓
商品送达 → 买家确认收货
     ↓
订单完成 (status=completed)
```

**卖家发货要求**:
| 要求 | 说明 | 超时处理 |
|------|------|----------|
| 发货时限 | 支付后3天内必须发货 | 超时自动创建纠纷 |
| 物流信息 | 必须提供物流单号和物流公司 | 无法跟踪则买家可申请纠纷 |
| 发货通知 | 系统自动通知买家 | 买家可实时查看物流状态 |

**发货API**:
```typescript
POST /api/orders/[id]/ship
{
  tracking_number: "SF1234567890",    // 物流单号
  logistics_provider: "顺丰速运"       // 物流公司
}
```

#### 4.4 物流跟踪系统

**支持的物流公司**:
| 物流公司 | 代码 | 支持地区 |
|----------|------|----------|
| 顺丰速运 | shunfeng | 中国大陆 |
| 圆通速递 | yuantong | 中国大陆 |
| 申通快递 | shentong | 中国大陆 |
| 中通快递 | zhongtong | 中国大陆 |
| 韵达快递 | yunda | 中国大陆 |
| EMS | ems | 中国大陆 |
| 京东快递 | jd | 中国大陆 |
| 德邦物流 | debangwuliu | 中国大陆 |

**物流查询流程**:
```
买家查看订单 → 点击物流跟踪
     ↓
系统调用快递100 API
     ↓
实时查询物流状态
     ↓
展示物流轨迹时间线
```

**物流状态映射**:
| 快递100状态码 | 状态说明 |
|--------------|----------|
| 0 | 运输中 |
| 1 | 揽件 |
| 3 | 已签收 |
| 4 | 退签 |
| 5 | 派件 |
| 6 | 退回 |

**物流表结构**:
```sql
order_tracking (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  tracking_number TEXT,              -- 物流单号
  logistics_provider TEXT,           -- 物流公司
  status TEXT,                       -- 物流状态
  current_location TEXT,             -- 当前位置
  estimated_delivery TIMESTAMPTZ,    -- 预计送达
  tracking_details JSONB,            -- 物流轨迹
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

**Affiliate订单追踪**:
```
用户点击推广链接 → 写入cookie (affiliate_post_id)
      ↓
下单时读取cookie → 关联到订单
      ↓
订单支付成功 → 计算佣金 → 写入affiliate_commissions
```

**支付渠道支持**:
| 渠道 | 适用场景 | 特点 |
|------|---------|------|
| Stripe | 国际信用卡 | 支持多币种、订阅扣费 |
| PayPal | PayPal用户 | 买家保护、争议处理 |
| 支付宝 | 中国大陆用户 | 扫码/跳转支付 |
| 微信支付 | 微信用户 | 扫码支付 |
| 银行转账 | 大额/B2B | 人工审核、对公转账 |

### 5. 订阅与会员模块

#### 5.1 订阅类型概览

| 订阅类型 | 入口 | 月费(USD) | 核心权益 | 目标用户 |
|----------|------|-----------|----------|----------|
| **Seller订阅** | `/subscription/seller` | $15/$50/$100 | 发布商品、接单、保证金额度 | 卖家 |
| **Affiliate订阅** | `/subscription/affiliate` | $4.99 | 推广商品赚佣金 | 推广者 |
| **Tip订阅** | `/subscription/tip` | $4.99 | 接收用户打赏 | 内容创作者 |

#### 5.2 Seller订阅档位（3档纯净模式）

| 档位 | 月费 | 商品数量限制 | 保证金额度 | 目标用户 | 推荐 |
|------|------|-------------|-----------|----------|------|
| **Starter** | $15 | 50个 | $15 | 个人/兼职卖家 | - |
| **Growth** | $49 (显示价) | 200个 | $50 | 成长型卖家 | ✅ |
| **Scale** | $99 (显示价) | 500个 | $100 | 品牌商/企业 | - |

**档位说明**:
- **Starter**: 零佣金、即时聊天、基础订单管理、标准客服
- **Growth**: 优先客服(6小时内响应)、批量导入/导出、带货佣金设置、基础推广工具
- **Scale**: 专属客户经理(2小时内响应)、深度数据分析、库存预警、首页推荐位、品牌专属页面

#### 5.3 订阅状态流转

```
创建订单 → pending → 支付成功 → active → 到期/取消
               ↓                        ↓
           支付失败                  自动续费
                                    ↓
                              cancelled/expired
                                    ↓
                              权益降级 → 通知用户
```

**状态说明**:
- `pending`: 待支付状态，创建订单后24小时内有效
- `active`: 已激活，享有全部权益
- `cancelled`: 用户主动取消，当前周期结束后失效
- `expired`: 已过期，权益自动降级

#### 5.4 订阅生命周期管理

**定时任务**:
- **订阅到期提醒**: 每天检查即将到期(7天内)的订阅，发送邮件提醒
- **订阅生命周期**: 每天处理过期订阅，同步用户权益降级

**权益同步机制**:
```
订阅激活/续费:
  profiles.subscription_type = 'seller'
  profiles.subscription_tier = 购买的档位值
  profiles.product_limit = 对应的商品数量限制

订阅过期:
  profiles.subscription_type = NULL
  profiles.subscription_tier = NULL
  profiles.product_limit = 0
  profiles.role = 'user' (从seller降级)
```

#### 5.5 首月折扣机制

- 新用户首次订阅可享受首月折扣
- 折扣价格显示在UI上，实际按折扣价扣费
- 次月起恢复原价，自动续费
- 折扣信息记录在 `subscriptions.is_discounted` 和 `discount_expiry_date`

#### 5.6 订阅与卖家类型联动

| 卖家类型 | Seller订阅要求 | 商品限制 | 保证金要求 |
|----------|---------------|----------|-----------|
| External卖家 | 必须购买 | 受subscription_tier限制 | 必须缴纳 |
| Direct卖家 | 无需购买 | 无限制 | 无需缴纳 |

**特殊权限**:
- `internal_tip_enabled`: Direct卖家无需Tip订阅即可接收打赏
- `internal_affiliate_enabled`: Direct卖家无需Affiliate订阅即可推广

#### 5.7 核心API与Hook

**API端点**:
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/subscriptions/create-pending` | POST | 创建待支付订阅订单 |
| `/api/subscriptions/create-payment` | POST | 创建支付会话(Stripe/PayPal) |
| `/api/subscriptions/history` | GET | 获取订阅历史 |
| `/api/cron/subscription-lifecycle` | GET | 定时处理过期订阅 |
| `/api/cron/subscription-expiry-reminders` | GET | 到期提醒任务 |

**Hook**:
```typescript
// 检查用户是否有有效订阅
const { hasActiveSubscription, subscriptionTier } = useSubscription()

// 检查商品发布权限
const canCreateProduct = hasActiveSubscription && 
  (sellerType === 'direct' || productCount < productLimit)
```

#### 5.8 订阅表结构

```sql
subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  subscription_type TEXT CHECK (subscription_type IN ('seller', 'affiliate', 'tip')),
  subscription_tier INTEGER,              -- 内部档位值: 15/50/100
  display_price DECIMAL(10,2),            -- 显示价格(可能不同于tier)
  product_limit INTEGER DEFAULT 0,        -- 商品数量限制
  amount DECIMAL(10,2) NOT NULL,          -- 实际支付金额
  currency VARCHAR(3) DEFAULT 'USD',      -- 支付货币
  status TEXT CHECK (status IN ('pending', 'active', 'cancelled', 'expired')),
  is_discounted BOOLEAN DEFAULT FALSE,    -- 是否首月折扣
  discount_expiry_date TIMESTAMPTZ,       -- 折扣到期日
  deposit_credit DECIMAL(10,2),           -- 保证金额度(等于subscription_tier)
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 6. 打赏模块

#### 6.1 打赏系统概述

打赏是平台的内容变现功能，允许用户向喜欢的内容创作者或卖家表达支持。

**打赏类型**:
| 类型 | 入口 | 接收者 | 订阅要求 |
|------|------|--------|----------|
| 帖子打赏 | 帖子详情页Tip按钮 | 帖子作者 | 需Tip订阅（Direct卖家除外） |
| 用户打赏 | 用户主页Tip按钮 | 被打赏用户 | 需Tip订阅（Direct卖家除外） |

#### 6.2 打赏流程

```
用户点击打赏 → 检查接收者是否开启打赏
     ↓
检查打赏者限额（防止洗钱）
     ↓
创建Stripe Checkout Session
     ↓
用户完成支付
     ↓
Webhook接收支付成功通知
     ↓
Stripe自动转账给接收者
     ↓
通知双方（打赏者、接收者）
```

#### 6.3 打赏限额

| 限制类型 | 金额 | 说明 |
|----------|------|------|
| 单次最低 | $1 | 防止小额骚扰 |
| 单次最高 | $500 | 防止大额风险 |
| 每日累计 | $2000 | 用户每日打赏上限 |

#### 6.4 打赏表结构

```sql
tip_transactions (
  id UUID PRIMARY KEY,
  sender_id UUID,                    -- 打赏者
  receiver_id UUID,                  -- 接收者
  amount DECIMAL(10,2),              -- 金额
  currency VARCHAR(3),               -- 货币
  post_id UUID,                      -- 关联帖子（可选）
  message TEXT,                      -- 留言
  status TEXT,                       -- pending/completed/failed
  stripe_transfer_id TEXT,           -- Stripe转账ID
  created_at TIMESTAMPTZ
)
```

#### 6.5 核心API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/tips/create` | POST | 创建打赏订单 |
| `/api/tips/webhook` | POST | Stripe回调处理 |

---

### 7. 带货（Affiliate）模块

#### 7.1 带货系统概述

带货是平台的推广分佣系统，允许推广者（Affiliate）帮助卖家推广商品并赚取佣金。

**参与角色**:
- **卖家**: 设置商品佣金率，允许Affiliate推广
- **Affiliate**: 创建推广内容，赚取佣金
- **买家**: 通过推广链接购买商品

#### 7.2 带货流程

```
卖家设置商品allow_affiliate=true
     ↓
设置commission_rate（如10%）
     ↓
Affiliate创建推广帖（需Affiliate订阅）
     ↓
帖子中包含affiliate_post_id
     ↓
用户点击推广链接 → 写入cookie(affiliate_post_id)
     ↓
用户下单 → 关联affiliate_post_id到订单
     ↓
订单支付成功 → 自动计算佣金
     ↓
写入affiliate_commissions表
     ↓
Affiliate申请结算 → Admin审核 → 打款
```

#### 7.3 佣金计算

**计算公式**:
```
佣金金额 = 商品金额 × 佣金率

佣金率来源优先级:
1. affiliate_products表中的自定义佣金率
2. products表中的默认佣金率
```

**示例**:
- 商品售价: $100
- 佣金率: 10%
- Affiliate佣金: $100 × 10% = $10

#### 7.4 核心表结构

```sql
affiliate_posts (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES posts(id),    -- 关联帖子
  product_id UUID REFERENCES products(id), -- 关联商品
  affiliate_id UUID,                     -- 推广者ID
  commission_rate DECIMAL(5,2),          -- 自定义佣金率
  affiliate_code TEXT,                   -- 推广码
  clicks INT DEFAULT 0,                  -- 点击数
  conversions INT DEFAULT 0,             -- 转化数
  created_at TIMESTAMPTZ
)

affiliate_products (
  id UUID PRIMARY KEY,
  affiliate_id UUID,
  product_id UUID,
  post_id UUID,                          -- 关联推广帖
  commission_rate DECIMAL(5,2),          -- 自定义佣金率
  status TEXT,                           -- active/inactive
  created_at TIMESTAMPTZ
)
```

#### 7.5 核心API

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/affiliate/posts/create` | POST | 创建推广帖 |
| `/api/affiliate/products/list` | GET | 获取可推广商品 |
| `/api/affiliate/stats` | GET | 获取推广统计数据 |

### 7. 佣金与推广模块

| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 推广链接 | 商品详情Affiliate按钮 | `affiliate_posts` | `app/api/affiliate/posts/create/route.ts` |
| 佣金计算 | 订单支付时自动 | `affiliate_commissions` | `lib/commissions/calculate.ts` |
| 佣金结算 | Admin后台 | `affiliate_commissions` | `app/api/admin/commissions/[id]/settle/route.ts` |

**佣金链路**:
```
Affiliate创建推广帖 → 用户点击带affiliate_id → 下单 → 支付成功 → 计算佣金 → 待结算 → Admin审核 → 打款
```

### 8. 保证金模块

#### 8.1 保证金系统概述

保证金系统是平台风险控制的核心机制，主要用于：
- **交易担保**: 确保卖家履约能力
- **纠纷赔付**: 纠纷败诉时用于赔付买家
- **违规处罚**: 扣除保证金作为违规惩罚

**适用对象**: 仅External卖家需要缴纳保证金，Direct卖家免保证金

#### 8.2 保证金额度规则

| 订阅档位 | 保证金额度 | 可接单金额上限 | 说明 |
|----------|-----------|---------------|------|
| Starter ($15) | $15 | $15 | 个人/兼职卖家 |
| Growth ($50) | $50 | $50 | 成长型卖家 |
| Scale ($100) | $100 | $100 | 品牌商/企业 |

**额度计算**:
```
当前可用额度 = 缴纳保证金总额 - 未完成订单总额
可接单条件: 新订单金额 ≤ 当前可用额度
```

#### 8.3 保证金状态流转

```
缴纳保证金 → active (可用)
     ↓
接单占用 → locked (锁定)
     ↓
订单完成 → active (释放)
     ↓
申请退款 → pending_refund (退款中)
     ↓
Admin审核 → refunded (已退款) / active (拒绝)
```

#### 8.4 保证金核心功能

| 功能 | 入口 | 核心逻辑 | 关键文件 |
|------|------|---------|----------|
| 缴纳保证金 | `/seller/deposit` | 创建支付订单，支持多种支付方式 | `app/api/deposits/pay/route.ts` |
| 检查额度 | 自动 | 下单前检查可用额度是否充足 | `lib/deposits/check-deposit-requirement.ts` |
| 额度锁定 | 下单时 | 订单创建时锁定对应额度 | `lib/deposits/payment-control.ts` |
| 额度释放 | 订单完成 | 订单完成后自动释放额度 | `lib/orders/auto-recovery.ts` |
| 申请退款 | 卖家中心 | 提交退款申请，需Admin审核 | `app/api/deposits/[lotId]/request-refund/route.ts` |
| 扣除保证金 | Admin后台 | 纠纷/违规时扣除保证金 | `lib/deposits/deduct-from-deposit.ts` |

#### 8.5 接单控制机制

**支付启用/禁用逻辑**:
```
可用额度 ≥ 新订单金额 → 允许接单 (payment_enabled = true)
可用额度 < 新订单金额 → 禁止接单 (payment_enabled = false)
```

**自动恢复机制**:
- 订单完成后自动检查未完成的订单总额
- 如果未完成订单 ≤ 保证金额度，自动恢复接单权限
- 通过 `checkAutoRecovery()` 函数实现

#### 8.6 保证金扣除场景

| 场景 | 扣除对象 | 扣除金额 | 处理流程 |
|------|---------|---------|----------|
| 纠纷败诉 | 卖家 | 按判决金额 | Admin判决 → 扣除保证金 → 赔付买家 |
| 违规处罚 | 卖家 | 按违规程度 | Admin处罚 → 扣除保证金 → 平台收入 |
| 佣金支付 | Affiliate | 应结算佣金 | 结算时从保证金扣除 |

**扣除函数**:
```typescript
await deductFromDeposit({
  sellerId: 'seller_uuid',
  amount: 50,
  currency: 'USD',
  reason: '纠纷败诉赔付',
  relatedId: 'order_uuid',
  relatedType: 'debt', // 'debt' | 'commission' | 'violation' | 'other'
  supabaseAdmin
})
```

#### 8.7 保证金表结构

```sql
seller_deposit_lots (
  id UUID PRIMARY KEY,
  seller_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2),              -- 缴纳金额
  currency VARCHAR(3),               -- 货币
  status TEXT,                       -- active/locked/pending_refund/refunded
  payment_method TEXT,               -- 支付方式
  payment_transaction_id UUID,       -- 关联支付记录
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 保证金审计日志
seller_deposit_audit_logs (
  id UUID PRIMARY KEY,
  seller_id UUID,
  action TEXT,                       -- deposit/lock/release/deduct/refund
  amount DECIMAL(10,2),
  currency VARCHAR(3),
  balance_after DECIMAL(10,2),       -- 操作后余额
  related_order_id UUID,             -- 关联订单
  reason TEXT,                       -- 操作原因
  created_at TIMESTAMPTZ
)
```

### 9. 即时通讯模块

| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 私信列表 | `/messages` | `conversations` | `app/(main)/messages/page.tsx` |
| 聊天窗口 | `/messages/[id]` | `messages` | `app/(main)/messages/[id]/page.tsx` |
| 创建会话 | 用户主页ChatButton | `conversations` | `lib/chat/getOrCreateConversationCore.ts` |
| 实时消息 | 自动 | `messages` | `lib/hooks/useRealtime.ts` |

**联动**:
- 新消息 → Realtime订阅 → 通知 → 未读计数
- 订单相关 → 自动创建会话 → 系统消息

### 10. 通知系统模块

| 类型 | 触发场景 | 接收者 |
|------|----------|--------|
| content_approved | 内容审核通过 | 作者 |
| order_paid | 订单支付成功 | 卖家 |
| seller_new_order | 新订单 | 卖家 |
| order_shipped | 订单发货 | 买家 |
| order_received | 订单完成 | 卖家 |
| order_cancel | 订单取消 | 双方 |
| subscription_activated | 订阅激活 | 用户 |
| tip_received | 收到打赏 | 接收者 |
| follow | 被关注 | 被关注者 |
| like | 被点赞 | 内容作者 |
| comment | 被评论 | 内容作者 |
| repost | 被转发 | 内容作者 |
| dispute_open | 纠纷开启 | 双方+Admin |

### 11. 管理员模块

| 功能 | 入口 | 核心表 | 关键文件 |
|------|------|--------|----------|
| 内容审核 | `/admin/review` | `posts`, `products` | `app/(main)/admin/review/page.tsx` |
| 用户管理 | `/admin/profiles` | `profiles` | `app/api/admin/profiles/*` |
| 订单纠纷 | `/admin/disputes` | `order_disputes` | `app/api/admin/disputes/route.ts` |
| 佣金结算 | `/admin/commissions` | `affiliate_commissions` | `app/api/admin/commissions/*` |
| 举报处理 | `/admin/reports` | `reports` | `components/admin/ReportManagement.tsx` |
| 系统监控 | `/admin/dashboard` | 多表统计 | `app/api/admin/monitoring/dashboard/route.ts` |

**审核流程**:
```
用户提交内容 → status=pending → Admin审核 → approve/reject → 通知用户 → 触发AI翻译
```

#### 11.1 内容审核系统

**审核内容类型**:
| 类型 | 表 | 状态字段 | 审核后状态 | 自动处理 |
|------|-----|---------|-----------|---------|
| 帖子 | `posts` | `status` | approved/rejected | AI翻译、话题提取 |
| 商品 | `products` | `status` | active/rejected | - |
| 评论 | `comments` | `status` | approved/rejected | - |

**帖子审核流程**:
```
用户发布帖子 → status=pending
     ↓
Admin审核列表 → 查看内容、图片
     ↓
  ├─ 通过 → status=approved
  │         ↓
  │    触发AI翻译 → 写入post_translations
  │    触发话题提取 → 关联post_topics
  │    通知关注者
  │
  └─ 拒绝 → status=rejected
            ↓
      填写拒绝原因 → 通知作者
```

**商品审核流程**:
```
卖家发布商品 → status=pending
     ↓
Admin审核 → 检查图片、描述、价格
     ↓
  ├─ 通过 → status=active (上架销售)
  │
  └─ 拒绝 → status=rejected
            ↓
      卖家可编辑后重新提交
```

**审核API**:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/admin/content-review` | GET | 获取待审核列表 |
| `/api/admin/content-review/[id]/approve` | POST | 审核通过 |
| `/api/admin/content-review/[id]/reject` | POST | 审核拒绝 |

#### 11.2 佣金结算系统

**结算流程**:
```
Affiliate推广 → 用户下单 → 订单支付成功
     ↓
自动计算佣金 → 写入affiliate_commissions (status=pending)
     ↓
Affiliate申请结算
     ↓
Admin审核 → 验证订单有效性
     ↓
  ├─ 通过 → 打款 → status=settled
  │         ↓
  │    从保证金扣除或平台支付
  │
  └─ 拒绝 → 填写原因 → 可重新申请
```

**佣金计算规则**:
```typescript
// 佣金金额 = 商品金额 × 佣金率
const commissionAmount = (itemPrice * quantity) * commissionRate / 100

// 佣金率来源优先级:
// 1. affiliate_products表中的自定义佣金率
// 2. products表中的默认佣金率
```

**结算状态**:
| 状态 | 说明 |
|------|------|
| `pending` | 待结算，等待Affiliate申请 |
| `requested` | 已申请，等待Admin审核 |
| `settled` | 已结算，佣金已支付 |
| `cancelled` | 已取消，订单退款或违规 |

**结算表结构**:
```sql
affiliate_commissions (
  id UUID PRIMARY KEY,
  affiliate_id UUID,              -- 推广者ID
  order_id UUID,                  -- 关联订单
  product_id UUID,                -- 关联商品
  commission_rate DECIMAL(5,2),   -- 佣金率(%)
  commission_amount DECIMAL(10,2), -- 佣金金额
  currency VARCHAR(3),            -- 货币
  status TEXT,                    -- pending/requested/settled/cancelled
  settled_at TIMESTAMPTZ,         -- 结算时间
  created_at TIMESTAMPTZ
)
```

**结算API**:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/commissions/pay` | POST | Affiliate申请结算 |
| `/api/admin/commissions` | GET | Admin获取待结算列表 |
| `/api/admin/commissions/[id]/settle` | POST | Admin确认结算 |

### 12. AI自动化模块

#### 12.1 AI系统概述

平台集成DeepSeek AI服务，提供内容翻译、话题提取、语言检测等自动化功能，支持多语言内容生态。

**AI服务配置**:
- **API提供商**: DeepSeek
- **API密钥**: `DEEPSEEK_API_KEY` 环境变量
- **支持功能**: 翻译、话题提取、内容补全、语言检测

#### 12.2 自动翻译系统

**翻译触发时机**:
- 帖子审核通过后自动翻译标题和内容
- 商品审核通过后自动翻译名称和描述
- 评论审核通过后自动翻译

**翻译流程**:
```
内容审核通过 → 检测源语言
     ↓
调用DeepSeek API翻译
     ↓
写入翻译表 (post_translations, product_translations等)
     ↓
用户切换语言时显示对应翻译
```

**支持翻译的内容类型**:
| 类型 | 源表 | 翻译表 | 翻译字段 |
|------|------|--------|----------|
| 帖子 | `posts` | `post_translations` | title, content |
| 商品 | `products` | `product_translations` | name, description, details |
| 评论 | `comments` | `comment_translations` | content |
| 商品评论 | `product_comments` | `product_comment_translations` | content |

**翻译API**:
```typescript
POST /api/ai/translate-after-publish
{
  type: 'post' | 'product' | 'comment' | 'product_comment',
  id: 'content_id'
}
```

#### 12.3 话题提取系统

**提取流程**:
```
帖子审核通过 → 读取帖子正文
     ↓
调用AI提取话题关键词
     ↓
匹配已有话题或创建新话题
     ↓
关联帖子到话题 (post_topics表)
```

**话题表结构**:
```sql
topics (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE,           -- 话题名称
  slug TEXT UNIQUE,           -- URL友好的标识
  description TEXT,           -- 话题描述
  icon_url TEXT,              -- 话题图标
  post_count INT DEFAULT 0,   -- 帖子数
  follower_count INT DEFAULT 0, -- 关注者数
  is_trending BOOLEAN DEFAULT false, -- 是否热门
  created_at TIMESTAMPTZ
)

post_topics (
  post_id UUID REFERENCES posts(id),
  topic_id UUID REFERENCES topics(id),
  PRIMARY KEY (post_id, topic_id)
)
```

#### 12.4 语言检测

**检测时机**:
- 创建帖子时自动检测内容语言
- 写入 `posts.content_lang` 字段
- 用于Feed推荐和翻译目标语言判断

**API**:
```typescript
// lib/ai/detect-language.ts
detectContentLanguage(content: string): 'zh' | 'en' | 'other'
```

#### 12.5 内容补全

**功能**: AI辅助用户撰写帖子内容
**入口**: 帖子创建页面的"AI补全"按钮
**API**: `POST /api/ai/complete`

---

### 13. 客服工单系统

#### 13.1 工单系统概述

客服工单系统用于处理用户提交的各类问题和请求，由Support角色管理和回复。

**工单类型**:
| 类型 | 说明 |
|------|------|
| `general` | 一般咨询 |
| `technical` | 技术问题 |
| `billing` | 账单问题 |
| `refund` | 退款申请 |
| `dispute` | 纠纷申诉 |
| `other` | 其他 |

**优先级**:
| 优先级 | 说明 |
|--------|------|
| `low` | 低优先级 |
| `medium` | 中优先级 |
| `high` | 高优先级 |
| `urgent` | 紧急 |

#### 13.2 工单状态流转

```
用户创建工单 → open (待处理)
     ↓
Admin/Support分配工单
     ↓
in_progress (处理中)
     ↓
回复用户 → waiting_for_user (等待用户回复)
     ↓
用户回复 → in_progress
     ↓
问题解决 → resolved (已解决)
     ↓
用户确认关闭 → closed (已关闭)
```

#### 13.3 工单核心API

**用户端**:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/support/tickets` | POST | 创建工单 |
| `/api/support/tickets` | GET | 获取我的工单列表 |
| `/api/support/tickets/[id]` | GET | 获取工单详情 |
| `/api/support/tickets/[id]/replies` | POST | 回复工单 |

**Admin/Support端**:
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/admin/support/tickets` | GET | 获取所有工单 |
| `/api/admin/support/tickets/[id]/assign` | POST | 分配工单 |
| `/api/admin/support/tickets/[id]/respond` | POST | 回复工单 |
| `/api/admin/support/tickets/[id]/escalate` | POST | 升级工单 |
| `/api/admin/support/tickets/[id]/close` | POST | 关闭工单 |

#### 13.4 工单表结构

```sql
support_tickets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),  -- 提交用户
  title TEXT,                            -- 标题
  description TEXT,                      -- 描述
  ticket_type TEXT,                      -- 工单类型
  priority TEXT,                         -- 优先级
  status TEXT,                           -- open/in_progress/waiting_for_user/resolved/closed
  assigned_to UUID,                      -- 分配给哪个Support
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

support_ticket_replies (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES support_tickets(id),
  user_id UUID,                          -- 回复者
  content TEXT,                          -- 回复内容
  is_internal BOOLEAN DEFAULT false,     -- 是否内部备注
  created_at TIMESTAMPTZ
)
```

---

### 14. 信任判断系统

#### 14.1 信任判断概述

信任判断系统为买家提供交易风险评估，帮助买家做出更明智的购买决策。

**判断维度**:
- 卖家历史纠纷率
- 卖家完成订单数
- 商品价格偏离度

#### 14.2 信任等级

| 等级 | 说明 | 建议 |
|------|------|------|
| `low_risk` | 低风险 | 平台判断：该卖家可信 |
| `medium_risk` | 中风险 | 系统判断：建议谨慎交易 |
| `high_risk` | 高风险 | 系统判断：建议避免交易 |

#### 14.3 判断规则配置

```typescript
// lib/trust-judgment/config.ts
export const TRUST_JUDGMENT_CONFIG = {
  // 统计近90天的纠纷
  dispute_window_days: 90,
  
  // 近90天有1笔纠纷即高风险
  high_risk_dispute_threshold: 1,
  
  // 完成订单数=0视为新卖家
  new_seller_order_threshold: 0,
  
  // 当前价超过历史最高价×1.2判中风险
  price_deviation_ratio: 1.2,
  
  // 历史成交价统计365天
  price_history_window_days: 365,
}
```

#### 14.4 判断逻辑

```
获取卖家近90天纠纷数
     ↓
纠纷数 ≥ 1 → high_risk
     ↓
完成订单数 = 0 → medium_risk (新卖家)
     ↓
检查商品价格
     ↓
当前价 > 历史最高价×1.2 → medium_risk
     ↓
low_risk
```

#### 14.5 信任判断API

```typescript
POST /api/trust/judgment
{
  sellerId: 'seller_uuid',
  productId: 'product_uuid'
}

Response:
{
  riskLevel: 'low_risk' | 'medium_risk' | 'high_risk',
  recommendation: '平台判断：该卖家可信',
  evidence: [
    { type: 'completed_orders', value: 10, description: '完成订单数' },
    { type: 'disputes', value: 0, description: '近90天纠纷数' }
  ]
}
```

---

### 15. 定时任务模块 (Cron Jobs)

| 任务 | 频率 | 功能 | 文件 |
|------|------|------|------|
| 取消过期订单 | 每小时 | 取消30分钟未支付订单 | `app/api/cron/cancel-expired-orders/route.ts` |
| 更新汇率 | 每天 | 更新货币汇率 | `app/api/cron/update-exchange-rates/route.ts` |
| 订阅到期提醒 | 每天 | 提醒即将到期订阅 | `app/api/cron/subscription-expiry-reminders/route.ts` |
| 订阅生命周期 | 每天 | 处理过期订阅 | `app/api/cron/subscription-lifecycle/route.ts` |
| 债务收集 | 每天 | 扣除卖家欠款 | `app/api/cron/collect-debts/route.ts` |
| 佣金逾期检查 | 每天 | 标记逾期佣金 | `app/api/cron/check-overdue-commissions/route.ts` |
| 自动关单 | 每天 | 自动完成已送达订单 | `app/api/cron/auto-close-tickets/route.ts` |
| 发货超时检查 | 每天 | 标记超时未发货 | `app/api/cron/check-shipping-timeout/route.ts` |
| 纠纷自动升级 | 每天 | 升级长期未处理纠纷 | `app/api/cron/auto-escalate-disputes/route.ts` |

---

## 用户类型与卖家类型系统

### 1. 用户角色 (User Role) - `profiles.role`

用户角色定义用户在平台上的基本身份权限，存储于 `profiles.role` 字段。

| 角色值 | 说明 | 权限 |
|--------|------|------|
| `user` | 普通用户 | 浏览内容、购买商品、发布帖子、社交互动 |
| `seller` | 卖家 | 普通用户权限 + 发布商品、管理订单、接收付款 |
| `affiliate` | 推广者 | 普通用户权限 + 创建推广链接、赚取佣金 |
| `admin` | 管理员 | 全平台管理权限、内容审核、用户管理、系统配置 |
| `support` | 客服 | 处理工单、纠纷、用户支持 |

**角色变更规则**:
```
user → seller: 购买 Seller 订阅后自动升级
seller → user: 订阅过期且未续费
admin/support: 仅由现有管理员手动设置
```

### 2. 卖家类型 (Seller Type) - `profiles.seller_type`

卖家类型是 **3档纯净模式** 的核心概念，用于区分不同类型的卖家，影响支付流程、保证金要求和商品发布限制。

| 类型值 | 说明 | 使用场景 |
|--------|------|----------|
| `external` | 外部卖家（第三方） | 普通用户注册的卖家，独立收款 |
| `direct` | 直营卖家（平台运营） | 平台自营或冷启动阶段的官方卖家 |

**核心差异**:

| 特性 | External 卖家 | Direct 卖家 |
|------|---------------|-------------|
| 收款方式 | 绑定自己的支付账户 | 使用平台支付账户 |
| 保证金要求 | 必须缴纳保证金才能接单 | 免保证金 |
| 订阅要求 | 必须购买 Seller 订阅 | 免订阅（或内部激活） |
| 商品发布限制 | 受 subscription_tier 限制 | 无限制 |
| 身份暴露 | 买家可见卖家信息 | 冷启动阶段对买家隐藏身份 |
| 资金去向 | 直接到卖家账户 | 先到平台，再结算给卖家 |

**数据库定义**:
```sql
ALTER TABLE profiles
  ADD COLUMN seller_type TEXT
  CHECK (seller_type IN ('external', 'direct'))
  DEFAULT 'external';
```

### 3. 用户来源 (User Origin) - `profiles.user_origin`

用户来源标记用户是外部注册还是内部创建，用于区分平台运营账号。

| 来源值 | 说明 | 用途 |
|--------|------|------|
| `external` | 外部用户 | 正常注册的用户 |
| `internal` | 内部用户 | 平台运营人员、测试账号、直营卖家 |

**内部用户特殊权限** (由 Admin 设置):
- `internal_tip_enabled`: 无需 Tip 订阅即可接收打赏
- `internal_affiliate_enabled`: 无需 Affiliate 订阅即可推广

**注意**: `user_origin` 是敏感字段，**绝不暴露给前端**，仅在服务端 API 中使用。

### 4. 订阅档位 (Subscription Tier) - `profiles.subscription_tier`

订阅档位与卖家类型配合使用，控制外部卖家的功能和商品发布数量。

| 档位 | 名称 | 商品发布限制 | 主要权益 |
|------|------|-------------|----------|
| `1` | 基础档 | 3 件 | 基础卖家功能 |
| `2` | 进阶档 | 20 件 | 更多商品位、优先展示 |
| `3` | 专业档 | 无限制 | 全部功能、最低手续费 |

**联动规则**:
```
Direct 卖家: 无视 subscription_tier，无商品发布限制
External 卖家: 必须满足 subscription_tier 对应的商品数量限制
```

### 5. 订单中的卖家类型快照

订单创建时会快照记录卖家的类型信息，用于后续的支付和退款处理。

| 字段 | 说明 |
|------|------|
| `orders.seller_type_snapshot` | 下单时卖家的类型 (`external`/`direct`) |
| `orders.funds_recipient` | 资金流向 (`platform`/`seller`) |

**用途**:
- 支付时决定使用谁的支付账户
- 退款时决定资金从哪退回
- 财务对账和审计

### 6. 类型系统联动链路

#### 6.1 用户注册流程
```
用户注册 → auth.users 创建 → profiles 创建
  ↓
role = 'user'
seller_type = 'external' (默认)
user_origin = 'external' (默认)
```

#### 6.2 成为卖家流程 (External)
```
用户购买 Seller 订阅
  ↓
支付成功 → subscription 创建
  ↓
Trigger: 更新 profiles
  role = 'seller'
  subscription_type = 'seller'
  subscription_tier = 购买的档位
  product_limit = 对应档位的限制
  ↓
用户可发布商品 (受 product_limit 限制)
```

#### 6.3 创建直营卖家流程 (Direct)
```
Admin 创建内部用户
  ↓
POST /api/admin/internal-users
  ↓
profiles 创建
  role = 'seller'
  seller_type = 'direct'
  user_origin = 'internal'
  ↓
Admin 设置 seller_type = 'direct'
  ↓
记录 seller_type_audit_logs
  ↓
直营卖家可无限制发布商品
```

#### 6.4 订单支付时的类型判断
```
创建订单
  ↓
记录 seller_type_snapshot = profiles.seller_type
记录 funds_recipient = 
  seller_type='direct' ? 'platform' : 'seller'
  ↓
支付时检查:
  IF seller_type_snapshot = 'direct'
    → 使用平台支付账户
    → 跳过保证金检查
  ELSE
    → 使用卖家绑定的支付账户
    → 检查保证金充足性
```

### 7. 关键 API 与类型检查

#### 检查卖家是否可以创建商品
```typescript
// /api/seller/product-limit/route.ts
const { data: profile } = await supabase
  .from('profiles')
  .select('seller_type, product_limit, subscription_tier')
  .eq('id', user.id)
  .single()

// Direct 卖家无限制
if (profile.seller_type === 'direct') {
  return { canCreate: true, limit: null }
}

// External 卖家检查当前商品数量和限制
const currentCount = await getUserActiveProductsCount(user.id)
return { 
  canCreate: currentCount < profile.product_limit,
  limit: profile.product_limit 
}
```

#### 验证卖家支付就绪状态
```typescript
// /lib/payments/validate-seller-payment-ready.ts
const sellerType = profile.seller_type as 'external' | 'direct' | null
const isDirect = sellerType === 'direct'

if (isDirect) {
  // Direct 卖家: 跳过订阅和保证金检查
  return { valid: true }
}

// External 卖家: 检查订阅、保证金、支付账户
// ... 详细检查逻辑
```

#### Admin 设置卖家类型
```typescript
// /api/admin/profiles/[id]/seller-type/route.ts
const beforeType = profile.seller_type || 'external'
const afterType = sellerType // 'external' | 'direct'

// 更新 profiles
await supabase
  .from('profiles')
  .update({ seller_type: afterType })
  .eq('id', params.id)

// 记录审计日志
await supabase
  .from('seller_type_audit_logs')
  .insert({
    seller_id: params.id,
    operator_admin_id: adminId,
    before_type: beforeType,
    after_type: afterType,
  })
```

### 8. 类型系统数据表

| 表名 | 相关字段 | 用途 |
|------|----------|------|
| `profiles` | `role`, `seller_type`, `user_origin`, `subscription_tier`, `product_limit` | 用户核心类型信息 |
| `subscriptions` | `subscription_type`, `subscription_tier` | 订阅详情 |
| `orders` | `seller_type_snapshot`, `funds_recipient` | 订单类型快照 |
| `seller_type_audit_logs` | `seller_id`, `before_type`, `after_type`, `operator_admin_id` | 类型变更审计 |

---

## 支付系统详解

平台支持 **5种支付方式**，覆盖国际和国内市场：

### 1. Stripe（信用卡/借记卡）

**适用场景**: 国际支付，支持 Visa、MasterCard、American Express 等

**技术实现**:
- 使用 Stripe Payment Intents API 创建支付
- 支持 3D Secure 安全验证
- Webhook 处理支付状态变更

**关键文件**:
```
/lib/payments/stripe.ts                    # Stripe 核心逻辑
/lib/payments/stripe-connect.ts            # Stripe Connect 分账
/app/api/payments/stripe/webhook/route.ts  # Webhook 处理
/app/api/payments/stripe/create-checkout-session/route.ts
/app/api/payments/stripe/create-order-checkout-session/route.ts
/app/api/payments/stripe/create-intent/route.ts
```

**支付流程**:
```
选择 Stripe 支付
  ↓
创建 PaymentIntent / Checkout Session
  ↓
返回 client_secret 或跳转 URL
  ↓
前端调起 Stripe 支付界面
  ↓
用户输入卡信息并确认
  ↓
Stripe 处理支付 → Webhook 通知
  ↓
更新订单状态为 paid
```

**环境变量**:
```bash
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

### 2. PayPal

**适用场景**: 国际支付，PayPal 余额或绑定的卡

**技术实现**:
- 使用 PayPal REST API v2
- 支持 Orders API 创建和捕获订单
- Webhook 处理支付状态

**关键文件**:
```
/lib/payments/paypal.ts                    # PayPal 核心逻辑
/lib/payments/paypal-payouts.ts            # PayPal 打款
/app/api/payments/paypal/create-order/route.ts
/app/api/payments/paypal/capture-order/route.ts
/app/api/payments/paypal/client-config/route.ts
```

**支付流程**:
```
选择 PayPal 支付
  ↓
创建 PayPal Order (v2/checkout/orders)
  ↓
返回 orderID
  ↓
前端调起 PayPal 弹窗/SDK
  ↓
用户登录并确认支付
  ↓
捕获订单 (capture)
  ↓
Webhook 通知 → 更新订单状态
```

**环境变量**:
```bash
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
```

---

### 3. 支付宝 (Alipay)

**适用场景**: 中国用户，支付宝余额/花呗/绑定的卡

**技术实现**:
- 使用支付宝开放平台 API
- 支持 PC 网站支付、手机网站支付
- 异步通知 (notify_url) 处理支付结果

**关键文件**:
```
/lib/payments/alipay.ts                    # 支付宝核心逻辑
/lib/payments/alipay-transfer.ts           # 支付宝转账
/app/api/payments/alipay/create-order/route.ts
/app/api/payments/alipay/callback/route.ts
/app/api/payments/alipay/refund/route.ts
```

**支付流程**:
```
选择支付宝支付
  ↓
生成支付宝订单参数（带签名）
  ↓
返回 form 表单或跳转 URL
  ↓
用户跳转支付宝页面/扫码
  ↓
支付完成 → 同步回调 + 异步通知
  ↓
验签并更新订单状态
```

**环境变量**:
```bash
ALIPAY_APP_ID=...
ALIPAY_PRIVATE_KEY=...
ALIPAY_PUBLIC_KEY=...
ALIPAY_NOTIFY_URL=https://.../api/payments/alipay/callback
ALIPAY_RETURN_URL=https://.../orders/success
```

---

### 4. 微信支付 (WeChat Pay)

**适用场景**: 中国用户，微信内支付或扫码支付

**技术实现**:
- 使用微信支付 Native/JSAPI API
- 支持扫码支付、公众号支付、H5 支付
- 异步通知处理支付结果

**关键文件**:
```
/lib/payments/wechat.ts                    # 微信支付核心逻辑
/lib/payments/wechat-transfer.ts           # 微信企业付款
/app/api/payments/wechat/create-order/route.ts
/app/api/payments/wechat/notify/route.ts
```

**支付流程**:
```
选择微信支付
  ↓
调用统一下单 API (unifiedorder)
  ↓
返回 prepay_id 和支付参数
  ↓
前端调起微信支付（JSAPI/扫码）
  ↓
用户确认支付
  ↓
微信异步通知 → 验签 → 更新订单
```

**环境变量**:
```bash
WECHAT_PAY_APP_ID=...
WECHAT_PAY_MCH_ID=...
WECHAT_PAY_API_KEY=...
WECHAT_PAY_CERT_PATH=./cert/apiclient_cert.pem
WECHAT_PAY_KEY_PATH=./cert/apiclient_key.pem
```

---

### 5. 银行转账 (Bank Transfer)

**适用场景**: 大额支付、企业客户、其他支付方式不可用

**技术实现**:
- 线下银行转账 + 线上凭证上传
- Admin 人工审核确认
- 支持多币种银行账户

**关键文件**:
```
/app/api/payments/bank/init/route.ts       # 初始化银行转账
/app/api/payments/bank/upload-proof/route.ts  # 上传转账凭证
/app/api/payments/bank/approve-proof/route.ts # Admin 审核凭证
```

**支付流程**:
```
选择银行转账
  ↓
获取平台银行账户信息
  ↓
创建待确认支付交易 (status=pending)
  ↓
用户线下转账到指定账户
  ↓
用户上传转账凭证
  ↓
Admin 审核凭证
  ↓
审核通过 → 更新订单为 paid
  ↓
审核拒绝 → 要求重新上传
```

**数据库表**:
- `bank_account_settings`: 平台收款账户配置
- `bank_payment_proofs`: 用户上传的转账凭证

---

### 支付方式对比

| 特性 | Stripe | PayPal | 支付宝 | 微信支付 | 银行转账 |
|------|--------|--------|--------|----------|----------|
| **适用地区** | 全球 | 全球 | 中国 | 中国 | 全球 |
| **支付体验** | 页面内输入卡号 | 弹窗/跳转 | 跳转/扫码 | 微信内/扫码 | 线下+上传凭证 |
| **到账速度** | 即时 | 即时 | 即时 | 即时 | 1-3工作日 |
| **手续费** | 2.9% + $0.30 | 3.49% + 固定费 | 0.6% | 0.6% | 银行收取 |
| **退款支持** | ✅ | ✅ | ✅ | ✅ | 人工处理 |
| **自动分账** | ✅ Connect | ✅ | ❌ | ❌ | ❌ |
| **Webhook** | ✅ | ✅ | ✅ | ✅ | ❌ |

---

### 支付配置管理

平台支持 **动态配置支付账户**，通过数据库管理：

```typescript
// 获取平台支付账户配置
const { data } = await supabase.rpc('get_platform_payment_account', {
  p_currency: 'USD',
  p_account_type: 'stripe',
})
```

**优先级**:
1. 数据库平台账户配置（支持多币种）
2. 环境变量（fallback）

**卖家绑定支付账户**:
- Stripe: 通过 Stripe Connect OAuth 绑定
- PayPal: 保存卖家 PayPal 邮箱
- 支付宝/微信: 保存卖家收款账号

---

### 支付安全与风控

1. **Webhook 签名验证**: 所有支付回调都验证签名
2. **幂等性处理**: 防止重复处理同一笔支付
3. **金额校验**: 支付金额必须与订单金额一致
4. **状态机校验**: 只允许从 pending → paid 状态转换
5. **卖家类型检查**: Direct 卖家使用平台账户收款

---

## 管理员后台系统

管理员后台是平台运营的核心，提供内容审核、用户管理、订单纠纷处理、财务管理等功能。

### 访问权限

- **Admin 角色**: 拥有所有后台权限
- **Support 角色**: 拥有部分权限（内容审核、工单处理、纠纷处理）

**权限检查**:
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()

if (profile?.role !== 'admin' && profile?.role !== 'support') {
  redirect('/')
}
```

---

### 1. 仪表盘 (/admin/dashboard)

**功能**: 展示平台核心数据概览

**显示内容**:
| 指标 | 数据来源 | 说明 |
|------|----------|------|
| 待审核帖子数 | `posts.status = 'pending'` | 需要审核的帖子 |
| 待审核商品数 | `products.status = 'pending'` | 需要审核的商品 |
| 待处理举报数 | `reports.status = 'pending'` | 用户举报待处理 |
| 待结算佣金数 | `affiliate_commissions.status = 'pending'` | 推广佣金待结算 |

**关键文件**:
```
/app/[locale]/(main)/admin/dashboard/page.tsx
/components/admin/ContentReview.tsx
/components/admin/ReportManagement.tsx
/components/admin/CommissionManagement.tsx
```

---

### 2. 内容审核 (/admin/review, /admin/content-review)

**功能**: 审核用户发布的帖子、商品、评论

**审核内容类型**:
| 类型 | 表 | 状态字段 | 审核后状态 |
|------|-----|----------|------------|
| 帖子 | `posts` | `status` | approved / rejected |
| 商品 | `products` | `status` | active / rejected |
| 评论 | `comments` | `status` | approved / rejected |
| 商品评论 | `product_comments` | `status` | approved / rejected |

**审核流程**:
```
用户提交内容 → status=pending
  ↓
Admin 查看待审核列表
  ↓
审核内容（查看详情、图片）
  ↓
选择操作：
  ├─ 通过 → 更新 status → 触发 AI 翻译 → 通知用户
  └─ 拒绝 → 更新 status → 填写拒绝原因 → 通知用户
```

**关键 API**:
```
POST /api/admin/content-review/[id]/approve
POST /api/admin/content-review/[id]/reject
```

**图片迁移**:
- 审核通过前，系统自动将图片从 Supabase 迁移到 Cloudinary
- 迁移失败则审核失败，需要重新尝试

---

### 3. 用户管理 (/admin/profiles, /admin/internal-users)

#### 3.1 普通用户管理

**功能**: 查看用户信息、封禁/解封账号、设置卖家类型

**操作**:
| 操作 | API | 说明 |
|------|-----|------|
| 封禁用户 | POST /api/admin/profiles/[id]/ban | 设置 status='banned' |
| 解封用户 | POST /api/admin/profiles/[id]/unban | 恢复 status='active' |
| 设置卖家类型 | POST /api/admin/profiles/[id]/seller-type | external / direct |
| 审核资料 | POST /api/admin/profiles/[id]/approve-profile | 通过身份认证 |
| 拒绝资料 | POST /api/admin/profiles/[id]/reject-profile | 拒绝身份认证 |

#### 3.2 内部用户管理 (/admin/internal-users)

**功能**: 创建平台运营账号（直营卖家、测试账号）

**内部用户特性**:
- `user_origin = 'internal'`
- 可设置为 `seller_type = 'direct'`（直营卖家）
- 可单独开启 `internal_tip_enabled` 和 `internal_affiliate_enabled`

**关键 API**:
```
GET    /api/admin/internal-users              # 列表
POST   /api/admin/internal-users              # 创建
POST   /api/admin/internal-users/[id]/set-direct-seller
POST   /api/admin/internal-users/[id]/tip-affiliate
POST   /api/admin/internal-users/[id]/set-password
```

---

### 4. 身份认证审核 (/admin/identity-verification)

**功能**: 审核用户提交的实名认证资料

**审核流程**:
```
用户提交认证资料 → identity_verifications 创建记录
  ↓
Admin 查看待审核列表
  ↓
审核证件照片、姓名、身份证号
  ↓
通过 → 更新 profiles.identity_verified = true
拒绝 → 填写拒绝原因
```

**关键 API**:
```
GET  /api/admin/identity-verification          # 待审核列表
POST /api/admin/identity-verification/[userId]/review
```

---

### 5. 订单与纠纷管理 (/admin/orders, /admin/disputes)

#### 5.1 订单管理

**功能**: 查看所有订单、处理异常订单

**订单状态**:
- `pending`: 待支付
- `paid`: 已支付，待发货
- `shipped`: 已发货
- `completed`: 已完成
- `cancelled`: 已取消
- `in_dispute`: 纠纷中

#### 5.2 纠纷处理 (/admin/disputes/[id])

**功能**: 处理买家发起的退款/纠纷申请

**纠纷类型**:
| 类型 | 说明 |
|------|------|
| refund | 退款申请 |
| quality | 商品质量问题 |
| delivery | 物流问题 |
| other | 其他问题 |

**处理流程**:
```
买家发起纠纷 → order_disputes 创建记录
  ↓
Admin 查看纠纷详情（订单信息、买卖双方、纠纷原因）
  ↓
调查沟通
  ↓
做出裁决：
  ├─ 支持买家 → 退款给买家 → 可能扣除卖家保证金
  ├─ 支持卖家 → 订单继续 → 可能扣除买家信用
  └─ 协商解决 → 双方达成一致
```

**关键 API**:
```
GET  /api/admin/disputes              # 纠纷列表
POST /api/admin/refunds/process       # 处理退款
```

---

### 6. 财务管理

#### 6.1 平台支付账户配置 (/admin/platform-payment-accounts)

**功能**: 配置平台收款账户（用于 Direct 卖家收款）

**支持的账户类型**:
- Stripe
- PayPal
- 支付宝
- 微信支付

**关键 API**:
```
GET    /api/admin/platform-payment-accounts
POST   /api/admin/platform-payment-accounts
PUT    /api/admin/platform-payment-accounts/[id]
DELETE /api/admin/platform-payment-accounts/[id]
```

#### 6.2 卖家支付账户审核 (/admin/payment-accounts)

**功能**: 审核卖家绑定的支付账户

**审核状态**:
- `pending`: 待审核
- `verified`: 已通过
- `rejected`: 已拒绝

**关键 API**:
```
POST /api/admin/payment-accounts/[id]/verify
```

#### 6.3 佣金结算 (/admin/commissions)

**功能**: 审核并结算 Affiliate 推广佣金

**结算流程**:
```
Affiliate 申请结算 → status=pending
  ↓
Admin 审核推广订单有效性
  ↓
确认结算 → POST /api/admin/commissions/[id]/settle
  ↓
转账给 Affiliate → 更新状态为 settled
```

**关键文件**:
```
/components/admin/CommissionManagement.tsx
```

#### 6.4 卖家债务管理 (/admin/seller-debts)

**功能**: 查看和管理卖家欠款（退款导致）

**关键 API**:
```
GET /api/admin/seller-debts
GET /api/admin/seller-debts/[sellerId]
```

#### 6.5 平台费用收取 (/admin/platform-fees)

**功能**: 向卖家收取平台服务费

**关键 API**:
```
POST /api/admin/platform-fees/charge
```

---

### 7. 举报处理 (/admin/reports)

**功能**: 处理用户举报（内容违规、用户违规）

**举报类型**:
| 类型 | 说明 |
|------|------|
| content | 内容违规（帖子/商品/评论） |
| user | 用户行为违规 |
| spam | 垃圾信息 |
| harassment | 骚扰 |
| other | 其他 |

**处理流程**:
```
用户举报 → reports 创建记录
  ↓
Admin 查看举报详情
  ↓
调查被举报内容/用户
  ↓
处理：
  ├─ 内容违规 → 删除内容 + 警告/封禁用户
  ├─ 用户违规 → 封禁用户
  └─ 无违规 → 驳回举报
  ↓
通知举报者处理结果
```

**关键 API**:
```
POST /api/admin/reports/[id]/send-result-notification
```

**关键文件**:
```
/components/admin/ReportManagement.tsx
```

---

### 8. 客服工单系统 (/admin/support)

**功能**: 处理用户提交的客服工单

**工单类型**:
| 类型 | 说明 |
|------|------|
| general | 一般咨询 |
| order | 订单问题 |
| payment | 支付问题 |
| account | 账号问题 |
| dispute | 纠纷申诉 |

**工单状态流转**:
```
open → assigned → in_progress → resolved/closed
         ↓
      escalated (升级给 Admin)
```

**关键 API**:
```
GET    /api/admin/support/tickets              # 工单列表
POST   /api/admin/support/tickets/[id]/assign  # 分配工单
POST   /api/admin/support/tickets/[id]/respond  # 回复工单
POST   /api/admin/support/tickets/[id]/update-status
POST   /api/admin/support/tickets/[id]/escalate # 升级工单
POST   /api/admin/support/tickets/[id]/close    # 关闭工单
```

---

### 9. 账户注销审核 (/admin/deletion-requests)

**功能**: 审核用户的账户注销申请

**审核流程**:
```
用户申请注销 → account_deletion_requests 创建记录
  ↓
系统检查：是否有未完成订单、是否有欠款
  ↓
Admin 审核
  ↓
通过 → 软删除用户数据 → 发送确认邮件
拒绝 → 填写原因 → 通知用户
```

**关键 API**:
```
GET  /api/admin/deletion-requests
POST /api/admin/deletion-requests/[id]/approve
POST /api/admin/deletion-requests/[id]/reject
```

---

### 10. 系统监控 (/admin/monitoring)

**功能**: 查看系统运行状态和关键指标

**监控内容**:
| 指标 | 说明 |
|------|------|
| 定时任务执行状态 | Cron Jobs 运行情况 |
| 支付成功率 | 各支付方式的成功率 |
| 订单统计 | 日/周/月订单量 |
| 用户增长 | 新注册用户趋势 |
| 异常日志 | 系统错误和异常 |

**关键 API**:
```
GET /api/admin/monitoring/dashboard
```

---

### 11. 违规处罚 (/admin/violation-penalties)

**功能**: 对违规卖家进行处罚（扣除保证金）

**关键 API**:
```
POST /api/admin/violation-penalties/deduct
```

---

### 12. 社区管理 (/admin/community)

**功能**: 管理社区话题、群组

**操作**:
- 创建/编辑话题
- 管理群组
- 设置社区规则

---

### 管理员后台文件结构

```
src/
├── app/[locale]/(main)/admin/
│   ├── dashboard/page.tsx              # 仪表盘
│   ├── review/page.tsx                 # 内容审核
│   ├── content-review/page.tsx         # 内容审核（新）
│   ├── profile-review/page.tsx         # 资料审核
│   ├── identity-verification/page.tsx  # 身份认证审核
│   ├── internal-users/page.tsx         # 内部用户管理
│   ├── orders/page.tsx                 # 订单管理
│   ├── disputes/[id]/page.tsx          # 纠纷处理详情
│   ├── commissions/page.tsx            # 佣金结算
│   ├── reports/page.tsx                # 举报处理
│   ├── support/page.tsx                # 客服工单
│   ├── deletion-requests/page.tsx      # 注销审核
│   ├── platform-payment-accounts/page.tsx  # 平台支付配置
│   ├── payment-accounts/page.tsx       # 卖家支付账户审核
│   ├── seller-debts/page.tsx           # 卖家债务
│   ├── seller-debts/[sellerId]/page.tsx # 卖家债务详情
│   ├── platform-fees/page.tsx          # 平台费用
│   ├── violation-penalties/page.tsx    # 违规处罚
│   ├── monitoring/page.tsx             # 系统监控
│   └── community/page.tsx              # 社区管理
│
├── components/admin/
│   ├── ContentReview.tsx               # 内容审核组件
│   ├── ReportManagement.tsx            # 举报管理组件
│   └── CommissionManagement.tsx        # 佣金管理组件
│
└── app/api/admin/
    ├── content-review/[id]/approve/route.ts
    ├── content-review/[id]/reject/route.ts
    ├── profiles/[id]/ban/route.ts
    ├── profiles/[id]/unban/route.ts
    ├── profiles/[id]/seller-type/route.ts
    ├── internal-users/route.ts
    ├── disputes/route.ts
    ├── refunds/process/route.ts
    ├── commissions/[id]/settle/route.ts
    ├── reports/[id]/send-result-notification/route.ts
    ├── support/tickets/route.ts
    ├── deletion-requests/route.ts
    ├── platform-payment-accounts/route.ts
    ├── payment-accounts/[id]/verify/route.ts
    ├── seller-debts/route.ts
    ├── monitoring/dashboard/route.ts
    └── ...
```

---

## 核心数据流

### 1. 用户注册登录流
```
用户访问 /login 或 /register
  ↓
输入凭证 → Supabase Auth API
  ↓
认证成功 → /api/auth/callback
  ↓
middleware.ts updateSession (设置 cookie)
  ↓
页面渲染 → useAuth Hook 获取用户信息
  ↓
RLS 策略根据 auth.uid() 控制数据访问
```

### 2. 内容发布审核流
```
用户创建帖子/商品
  ↓
写入数据库 (status=pending)
  ↓
Admin 收到审核通知
  ↓
Admin 审核 (approve/reject)
  ↓
更新 status (approved/active 或 rejected)
  ↓
通知作者审核结果
  ↓
如通过 → 触发 AI 翻译/话题提取
  ↓
内容出现在 Feed/商城
```

### 3. 订单支付流
```
买家下单 → 创建订单 (status=pending)
  ↓
跳转支付页 → 选择支付方式
  ↓
调用支付 API (Stripe/Alipay/WeChat)
  ↓
第三方支付页面
  ↓
支付完成 → Webhook/回调
  ↓
验证支付 → 更新订单 (status=paid)
  ↓
扣减库存 → 计算佣金
  ↓
通知买卖双方
  ↓
卖家发货 → 买家确认收货 → 订单完成
```

### 4. 社交互动流
```
用户点击点赞/关注/评论
  ↓
前端限流 (防抖)
  ↓
API 请求
  ↓
DB 限流检查 (trigger)
  ↓
写入数据表
  ↓
更新计数 (trigger)
  ↓
通知接收者
  ↓
实时推送 (Realtime)
```

---

## 技术栈详解

### 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14.2.35 | React 框架，App Router |
| React | 18.2.0 | UI 库 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 3.3 | 样式 |

### 后端与数据
| 技术 | 用途 |
|------|------|
| Supabase | PostgreSQL 数据库、认证、存储 |
| @supabase/ssr | 服务端渲染支持 |
| @supabase/supabase-js | 客户端 SDK |

### 状态管理
| 技术 | 用途 |
|------|------|
| Zustand | 全局状态管理（购物车、用户状态） |
| @tanstack/react-query | 服务端状态管理、缓存 |
| React Context | 认证状态等局部状态 |

### UI 组件
| 技术 | 用途 |
|------|------|
| Radix UI | 无头组件（Dialog、Dropdown、Select 等） |
| Lucide React | 图标库 |
| Framer Motion | 动画 |

### 国际化
| 技术 | 用途 |
|------|------|
| next-intl | 国际化路由和翻译 |

### 支付
| 技术 | 用途 |
|------|------|
| Stripe | 信用卡支付 |
| @stripe/stripe-js | Stripe 前端 SDK |

---

## 项目目录结构

```
c:\Stratos/
├── src/
│   ├── app/[locale]/                    # i18n 路由根目录
│   │   ├── (auth)/                       # 认证路由组
│   │   │   ├── login/page.tsx            # 登录页
│   │   │   ├── register/page.tsx         # 注册页
│   │   │   ├── forgot-password/page.tsx  # 忘记密码
│   │   │   └── reset-password/page.tsx   # 重置密码
│   │   ├── (main)/                       # 主应用路由组
│   │   │   ├── admin/                    # 管理后台
│   │   │   │   ├── dashboard/page.tsx    # 仪表盘
│   │   │   │   ├── review/page.tsx       # 内容审核
│   │   │   │   ├── orders/page.tsx       # 订单管理
│   │   │   │   └── ...
│   │   │   ├── cart/page.tsx             # 购物车
│   │   │   ├── checkout/page.tsx         # 结账流程
│   │   │   ├── feed/page.tsx             # 社交动态流
│   │   │   ├── messages/[id]/page.tsx    # 私信聊天
│   │   │   ├── orders/[id]/page.tsx      # 订单详情
│   │   │   ├── product/[id]/             # 商品详情
│   │   │   │   ├── page.tsx              # 服务端组件
│   │   │   │   └── ProductPageClient.tsx # 客户端组件
│   │   │   ├── profile/[id]/page.tsx     # 用户主页
│   │   │   ├── seller/                   # 卖家中心
│   │   │   │   ├── landing/page.tsx      # 卖家引导页
│   │   │   │   └── orders/page.tsx       # 卖家订单管理
│   │   │   └── settings/page.tsx         # 用户设置
│   │   └── api/                          # API 路由
│   │       ├── auth/                     # 认证 API
│   │       ├── checkout/                 # 结账验证
│   │       ├── orders/                   # 订单 API
│   │       ├── payments/                 # 支付回调
│   │       └── ...
│   ├── components/                       # React 组件
│   │   ├── admin/                        # 管理后台组件
│   │   ├── chat/                         # 聊天组件
│   │   ├── ecommerce/                    # 电商组件
│   │   │   ├── ProductCard.tsx           # 商品卡片
│   │   │   ├── ProductLikeButton.tsx     # 点赞按钮
│   │   │   ├── ProductWantButton.tsx     # 想要按钮
│   │   │   ├── ProductDetailsTabs.tsx    # 商品详情标签页
│   │   │   └── ...
│   │   ├── social/                       # 社交组件
│   │   │   ├── PostCard.tsx              # 帖子卡片
│   │   │   ├── LikeButton.tsx            # 点赞按钮
│   │   │   ├── CommentSection.tsx        # 评论区
│   │   │   ├── FollowButton.tsx          # 关注按钮
│   │   │   └── ...
│   │   └── ui/                           # 基础 UI 组件
│   │       ├── button.tsx                # 按钮
│   │       ├── dialog.tsx                # 对话框
│   │       ├── toast.tsx                 # 通知
│   │       └── ...
│   ├── lib/                              # 工具库和业务逻辑
│   │   ├── hooks/                        # 自定义 React Hooks
│   │   │   ├── useAuth.ts                # 认证 Hook
│   │   │   ├── useProducts.ts            # 商品数据 Hook
│   │   │   ├── useCartValidation.ts      # 购物车验证
│   │   │   └── ...
│   │   ├── payments/                     # 支付相关逻辑
│   │   │   ├── stripe.ts                 # Stripe 集成
│   │   │   ├── paypal.ts                 # PayPal 集成
│   │   │   ├── alipay.ts                 # 支付宝集成
│   │   │   └── wechat.ts                 # 微信支付集成
│   │   ├── supabase/                     # Supabase 客户端
│   │   │   ├── client.ts                 # 浏览器客户端
│   │   │   ├── server.ts                 # 服务端客户端
│   │   │   └── admin.ts                  # 管理员客户端
│   │   ├── types/                        # TypeScript 类型定义
│   │   │   └── api.ts                    # API 类型
│   │   └── utils/                        # 工具函数
│   │       ├── toast.ts                  # 通知工具
│   │       ├── image-retry.ts            # 图片重试逻辑
│   │       └── ...
│   ├── messages/                         # i18n 翻译文件
│   │   ├── en.json                       # 英文翻译
│   │   └── zh.json                       # 中文翻译
│   └── store/                            # Zustand 状态管理
│       └── cartStore.ts                  # 购物车状态
├── public/                               # 静态资源
├── scripts/                              # 脚本工具
└── docs/                                 # 项目文档
```

---

## 核心开发规范

### 1. 组件开发规范

#### Server Component vs Client Component

**默认使用 Server Component**，只有在以下情况使用 Client Component：

| 场景 | 使用 Client Component |
|------|----------------------|
| 使用 React Hooks (useState, useEffect) | ✅ |
| 使用浏览器 API (localStorage, window) | ✅ |
| 使用事件处理器 (onClick, onSubmit) | ✅ |
| 使用 Context | ✅ |
| 需要客户端交互 | ✅ |
| 纯数据展示 | ❌ (Server) |
| SEO 关键内容 | ❌ (Server) |

**命名约定**：
```typescript
// Server Component - 无后缀
// app/[locale]/(main)/product/[id]/page.tsx
export default async function ProductPage({ params }: { params: { id: string } }) {
  // 服务端获取数据
  const product = await getProduct(params.id)
  return <ProductPageClient product={product} />
}

// Client Component - Client 后缀
// ProductPageClient.tsx
'use client'
export function ProductPageClient({ product }: ProductPageClientProps) {
  const [count, setCount] = useState(0)
  // 客户端逻辑
}
```

#### Props 接口定义

```typescript
// 每个组件都必须定义 Props 接口
interface ProductCardProps {
  product: Product
  showActions?: boolean
  onLike?: (id: string) => void
}

// 使用 React.FC 或函数声明
export function ProductCard({ product, showActions = true, onLike }: ProductCardProps) {
  // ...
}
```

### 2. 国际化 (i18n) 规范

**核心原则：绝不硬编码任何文本**

#### 翻译文件结构

```json
// src/messages/en.json
{
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel",
    "error": "Error"
  },
  "product": {
    "addToCart": "Add to Cart",
    "buyNow": "Buy Now",
    "outOfStock": "Out of Stock"
  },
  "navigation": {
    "home": "Home",
    "cart": "Shopping Cart"
  }
}
```

#### Server Component 中使用

```typescript
import { getTranslations } from 'next-intl/server'

export default async function ProductPage() {
  const t = await getTranslations('product')
  const tCommon = await getTranslations('common')
  
  return (
    <div>
      <h1>{t('addToCart')}</h1>
      <Button>{tCommon('save')}</Button>
    </div>
  )
}
```

#### Client Component 中使用

```typescript
'use client'

import { useTranslations } from 'next-intl'

export function ProductCard() {
  const t = useTranslations('product')
  
  return <Button>{t('addToCart')}</Button>
}
```

#### 向 Client Component 传递翻译

**推荐方式**：传递翻译后的字符串

```typescript
// Server Component
export default async function ProductPage() {
  const t = await getTranslations('product')
  
  return (
    <ProductPageClient 
      translations={{
        addToCart: t('addToCart'),
        buyNow: t('buyNow'),
        toastSuccess: t('toastSuccess')
      }}
    />
  )
}

// Client Component
'use client'

interface ProductPageClientProps {
  translations: {
    addToCart: string
    buyNow: string
    toastSuccess: string
  }
}

export function ProductPageClient({ translations }: ProductPageClientProps) {
  const handleClick = () => {
    showSuccess('Added!', translations.toastSuccess)
  }
  
  return <Button onClick={handleClick}>{translations.addToCart}</Button>
}
```

### 3. Supabase 使用规范

#### 客户端使用

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// 在 Client Component 中使用
'use client'

import { createClient } from '@/lib/supabase/client'

export function ProductList() {
  const supabase = createClient()
  
  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .then(({ data }) => setProducts(data))
  }, [])
}
```

#### 服务端使用

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore?.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore?.set({ name, value, ...options })
          } catch (error) {
            // Server Component 中可忽略
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore?.set({ name, value: '', ...options })
          } catch (error) {
            // Server Component 中可忽略
          }
        },
      },
    }
  )
}

// 在 Server Component 中使用
export default async function ProductPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    
  return <ProductList products={products} />
}
```

#### 管理员权限使用

```typescript
// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // 服务端密钥
  )
}

// 仅在 API Route 或 Server Action 中使用
// 用于需要绕过 RLS 的场景
```

### 4. 图片处理规范

#### 图片加载重试机制

**必须使用** `createImageErrorHandler` 处理图片加载失败：

```typescript
import { createImageErrorHandler } from '@/lib/utils/image-retry'

// 在组件中创建处理器
export function ProductPageClient({ product }: ProductPageClientProps) {
  const handleImageError = createImageErrorHandler({
    maxRetries: 3,                    // 最大重试次数
    retryDelay: 1000,                 // 重试间隔(ms)
    fallbackSrc: '/placeholder-product.png', // 兜底图
  })
  
  return (
    <img
      src={product.images[0]}
      alt={product.name}
      onError={handleImageError}
      className="w-full h-full object-cover"
    />
  )
}
```

#### 图片 URL 来源

- **主图存储**: Cloudinary (res.cloudinary.com)
- **旧数据迁移**: 从 Supabase Storage 迁移到 Cloudinary
- **外部图片**: 支持 Unsplash、淘宝等（需配置域名）

#### next.config.js 图片配置

```javascript
// next.config.js
const nextConfig = {
  images: {
    domains: ['res.cloudinary.com', 'img.alicdn.com', 'images.unsplash.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/**',
      },
    ],
  },
}
```

### 5. Toast 通知规范

#### 必须使用翻译后的标题

```typescript
import { showInfo, showSuccess, showError, showWarning } from '@/lib/utils/toast'

// ❌ 错误：不传递标题
showSuccess('操作成功')

// ✅ 正确：传递翻译后的标题
showSuccess('操作成功', translations.toastSuccess)
showError('操作失败', translations.toastError)
showInfo('请稍候', translations.toastInfo)
showWarning('注意', translations.toastWarning)
```

#### 翻译键定义

```json
// messages/en.json
{
  "common": {
    "toastInfo": "Info",
    "toastSuccess": "Success",
    "toastError": "Error",
    "toastWarning": "Warning"
  }
}

// messages/zh.json
{
  "common": {
    "toastInfo": "提示",
    "toastSuccess": "成功",
    "toastError": "错误",
    "toastWarning": "警告"
  }
}
```

### 6. 状态管理规范

#### Zustand Store 结构

```typescript
// src/store/cartStore.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface CartItem {
  product_id: string
  quantity: number
  price: number
  name: string
  image: string
  color?: string
  size?: string
}

interface CartStore {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  getTotal: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const existing = get().items.find(i => i.product_id === item.product_id)
        if (existing) {
          set({
            items: get().items.map(i =>
              i.product_id === item.product_id
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            )
          })
        } else {
          set({ items: [...get().items, item] })
        }
      },
      removeItem: (productId) => {
        set({ items: get().items.filter(i => i.product_id !== productId) })
      },
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
        } else {
          set({
            items: get().items.map(i =>
              i.product_id === productId ? { ...i, quantity } : i
            )
          })
        }
      },
      clearCart: () => set({ items: [] }),
      getTotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0)
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
```

#### 在组件中使用

```typescript
'use client'

import { useCartStore } from '@/store/cartStore'

export function AddToCartButton({ product }: { product: Product }) {
  const addItem = useCartStore((state) => state.addItem)
  const items = useCartStore((state) => state.items)
  
  const handleAdd = () => {
    addItem({
      product_id: product.id,
      quantity: 1,
      price: product.price,
      name: product.name,
      image: product.images[0],
    })
  }
  
  return <Button onClick={handleAdd}>Add to Cart ({items.length})</Button>
}
```

---

## 业务逻辑详解

### 1. 商品生命周期

```
创建商品 → 待审核 → 审核通过 → 上架销售 → 售出/下架
    ↓           ↓         ↓          ↓
  编辑商品   审核拒绝   编辑商品   库存管理
```

#### 商品状态

| 状态 | 说明 | 可见性 |
|------|------|--------|
| `active` | 上架销售 | 所有人可见 |
| `inactive` | 下架 | 仅卖家可见 |
| `sold_out` | 售罄 | 所有人可见（标记售罄） |

#### 商品数据结构

```typescript
interface Product {
  id: string
  name: string
  description?: string
  price: number
  currency: string
  stock: number | null
  images: string[]
  color_options?: Array<{
    name: string
    image_url: string | null
    image_from_index: number | null
  }>
  sizes?: string[]
  seller_id: string
  status: 'active' | 'inactive' | 'sold_out'
  condition?: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below'
  shipping_fee?: number
  sales_countries?: string[]
  // 翻译字段
  content_lang?: 'zh' | 'en' | null
  name_translated?: string
  description_translated?: string
  // 统计字段
  like_count: number
  want_count: number
  share_count: number
  favorite_count: number
}
```

### 2. 订单状态流转

```
待付款 → 已付款 → 已发货 → 已送达 → 已完成
   ↓        ↓        ↓        ↓
 取消    退款    纠纷    纠纷
```

#### 订单状态

| 状态 | 说明 | 操作 |
|------|------|------|
| `pending` | 待付款 | 付款/取消 |
| `paid` | 已付款 | 发货 |
| `shipped` | 已发货 | 确认收货 |
| `completed` | 已完成 | 评价 |
| `cancelled` | 已取消 | - |

### 3. 支付流程

#### 支付渠道

| 渠道 | 前端 SDK | 后端 API | 回调方式 |
|------|----------|----------|----------|
| Stripe | @stripe/stripe-js | Stripe API | Webhook |
| PayPal | PayPal SDK | PayPal API | Webhook |
| 支付宝 | - | 支付宝 API | 异步通知 |
| 微信支付 | - | 微信支付 API | 异步通知 |
| 银行转账 | - | - | 人工审核 |

#### 支付状态

| 状态 | 说明 |
|------|------|
| `pending` | 待支付 |
| `paid` | 已支付 |
| `failed` | 支付失败 |
| `refunded` | 已退款 |

### 4. 用户角色与权限

| 角色 | 权限 |
|------|------|
| `user` | 浏览、购买、发布帖子 |
| `seller` | user + 发布商品、管理订单 |
| `admin` | 所有权限 + 审核内容、管理用户 |

---

## 常见任务指南

### 1. 添加新页面

```typescript
// 1. 创建目录结构
// src/app/[locale]/(main)/new-feature/page.tsx

// 2. Server Component - 获取数据
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { NewFeatureClient } from './NewFeatureClient'

export default async function NewFeaturePage() {
  const t = await getTranslations('newFeature')
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('some_table')
    .select('*')
  
  return (
    <NewFeatureClient 
      data={data}
      translations={{
        title: t('title'),
        save: t('save'),
        toastSuccess: t('toastSuccess'),
      }}
    />
  )
}

// 3. Client Component - 交互逻辑
'use client'

import { useState } from 'react'
import { showSuccess } from '@/lib/utils/toast'

interface NewFeatureClientProps {
  data: any[]
  translations: {
    title: string
    save: string
    toastSuccess: string
  }
}

export function NewFeatureClient({ data, translations }: NewFeatureClientProps) {
  const [items, setItems] = useState(data)
  
  const handleSave = () => {
    // 保存逻辑
    showSuccess('Saved!', translations.toastSuccess)
  }
  
  return (
    <div>
      <h1>{translations.title}</h1>
      {/* ... */}
    </div>
  )
}
```

### 2. 添加新 API 路由

```typescript
// src/app/api/new-feature/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('some_table')
      .select('*')
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('some_table')
      .insert(body)
      .select()
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### 3. 添加翻译

```json
// 1. 添加到 messages/en.json
{
  "newFeature": {
    "title": "New Feature",
    "description": "This is a new feature",
    "save": "Save",
    "toastSuccess": "Success"
  }
}

// 2. 添加到 messages/zh.json
{
  "newFeature": {
    "title": "新功能",
    "description": "这是一个新功能",
    "save": "保存",
    "toastSuccess": "成功"
  }
}
```

### 4. 添加新组件

```typescript
// src/components/new-feature/NewComponent.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface NewComponentProps {
  title: string
  onAction?: () => void
}

export function NewComponent({ title, onAction }: NewComponentProps) {
  const [count, setCount] = useState(0)
  
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <p>Count: {count}</p>
      <Button onClick={() => setCount(c => c + 1)}>Increment</Button>
      {onAction && <Button onClick={onAction}>Action</Button>}
    </div>
  )
}
```

---

## 常见错误与解决方案

### 1. "Toast not initialized"

**原因**: Toast 组件未正确初始化

**解决**:
```typescript
// 确保在 layout.tsx 中包含 Toaster
import { Toaster } from '@/components/ui/toaster'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

### 2. "useAuth must be used within AuthProvider"

**原因**: AuthProvider 未包裹应用

**解决**:
```typescript
// app/layout.tsx
import { AuthProvider } from '@/lib/providers/AuthProvider'

export default function RootLayout({ children }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}
```

### 3. 图片加载失败

**原因**: 图片 URL 无效或网络问题

**解决**:
```typescript
// 确保使用 image-retry
import { createImageErrorHandler } from '@/lib/utils/image-retry'

const handleImageError = createImageErrorHandler({
  maxRetries: 3,
  retryDelay: 1000,
  fallbackSrc: '/placeholder-product.png',
})

<img src={url} onError={handleImageError} />
```

### 4. i18n 翻译缺失

**原因**: 翻译键未在 messages/*.json 中定义

**解决**:
1. 检查 `messages/en.json` 和 `messages/zh.json`
2. 确保键路径正确（如 `common.save`）
3. 重启开发服务器

### 5. Supabase RLS 权限错误

**原因**: Row Level Security 策略阻止访问

**解决**:
```typescript
// 使用 Service Role Key（仅服务端）
import { createAdminClient } from '@/lib/supabase/admin'

// 在 API Route 中使用
const supabase = createAdminClient()
```

### 6. "window is not defined"

**原因**: 在 Server Component 或 SSR 期间访问浏览器 API

**解决**:
```typescript
// 使用 typeof window 检查
if (typeof window !== 'undefined') {
  localStorage.setItem('key', 'value')
}

// 或在 useEffect 中使用
useEffect(() => {
  localStorage.setItem('key', 'value')
}, [])
```

---

## 性能优化指南

### 1. 图片优化

```typescript
// 使用预加载
import { useImagePreload } from '@/lib/hooks/useImagePreload'

const { isPreloading, preloadedImages } = useImagePreload(
  product.images,
  currentIndex,
  { preloadDistance: 2 }
)
```

### 2. 数据获取优化

```typescript
// 使用 React Query 缓存
import { useQuery } from '@tanstack/react-query'

const { data, isLoading } = useQuery({
  queryKey: ['product', id],
  queryFn: () => fetchProduct(id),
  staleTime: 5 * 60 * 1000, // 5分钟
})
```

### 3. 组件优化

```typescript
// 使用 useMemo 缓存计算
const priceDisplay = useMemo(
  () => formatPrice(price, currency),
  [price, currency]
)

// 使用 useCallback 缓存回调
const handleClick = useCallback(() => {
  doSomething()
}, [dep])
```

---

## 测试与调试

### 开发命令

```bash
# 开发服务器
npm run dev

# 构建
npm run build

# 代码检查
npm run lint

# 项目检查
npm run check

# E2E 测试
npm run test:e2e
```

### 调试技巧

1. **React DevTools**: 检查组件树和 Props
2. **Supabase Dashboard**: 查看数据库和日志
3. **Network Tab**: 检查 API 请求
4. **Console**: 查看日志和错误

---

## 部署与发布

### 环境变量

```bash
# 必需
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 支付
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# PayPal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=

# 其他
NEXT_PUBLIC_APP_URL=
```

### 部署检查清单

- [ ] 所有环境变量已配置
- [ ] 数据库迁移已执行
- [ ] RLS 策略已配置
- [ ] Webhook 已配置
- [ ] 图片域名已配置
- [ ] 翻译文件完整
- [ ] 构建成功
- [ ] 测试通过

---

## 快速参考

### 常用导入

```typescript
// UI 组件
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

// 工具
import { showSuccess, showError } from '@/lib/utils/toast'
import { createImageErrorHandler } from '@/lib/utils/image-retry'

// Hooks
import { useAuth } from '@/lib/hooks/useAuth'
import { useTranslations } from 'next-intl'

// Supabase
import { createClient } from '@/lib/supabase/client'    // Client
import { createClient } from '@/lib/supabase/server'    // Server

// Store
import { useCartStore } from '@/store/cartStore'
```

### 文件模板

**新页面**:
```typescript
// page.tsx (Server)
import { getTranslations } from 'next-intl/server'
export default async function Page() {
  const t = await getTranslations('namespace')
  return <div>{t('key')}</div>
}
```

**新组件**:
```typescript
// Component.tsx (Client)
'use client'
interface Props { }
export function Component({ }: Props) {
  return <div></div>
}
```

**新 API**:
```typescript
// route.ts
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ data: [] })
}
```

---

## Feed 推荐系统

平台采用 **个性化 Feed 算法**，结合社交关系和用户行为推荐内容。

### 推荐算法核心

**RPC 函数**: `get_personalized_feed`

**评分公式**:
```
综合分 = tier_base + engagement_score * recency_decay

engagement_score = ln(1 + like_count) + ln(1 + comment_count) + tip_amount * 0.01
recency_decay = EXP(-0.029 * hours_since_created)
```

**三层内容分级**:

| 层级 | 内容来源 | 基础分 | 说明 |
|------|----------|--------|------|
| Tier 1 | 关注用户 | 100 | 用户主动关注的创作者 |
| Tier 2 | 关注话题 | 50 | 用户关注的话题下的帖子 |
| Tier 3 | 其他内容 | 0 | 平台其他优质内容 |

**多样性控制**:
- 前 20 条内容中，同一作者最多出现 2 次
- 排除用户近期看过的内容（默认 7 天）
- 排除用户举报过的内容和作者

**关键文件**:
```
/supabase/migrations/180_get_personalized_feed_rpc.sql
/supabase/migrations/221_feed_recommendation_feedback_and_reasons_rpc.sql
/supabase/migrations/179_feed_impressions.sql
```

**推荐原因**:
- `following`: 你关注的用户
- `topic_follow`: 你关注的话题
- `trending`: 热门内容
- `similar_interests`: 兴趣相似

---

## 社区与兴趣小组

### 兴趣小组 (Community Groups)

**功能**: 用户可以创建和加入兴趣小组，在小组内发布内容

**核心表**:
| 表名 | 说明 |
|------|------|
| `community_groups` | 小组信息 |
| `group_members` | 小组成员关系 |

**小组角色**:
| 角色 | 权限 |
|------|------|
| `admin` | 管理小组、审核内容、设置规则 |
| `moderator` | 协助管理、审核内容 |
| `member` | 发布内容、参与讨论 |

**帖子关联小组**:
- 帖子可选 `group_id` 字段
- 发布到小组的帖子会出现在小组页面
- 同时可能出现在 Feed 中（取决于推荐算法）

**关键文件**:
```
/app/[locale]/(main)/groups/page.tsx              # 小组列表
/app/[locale]/(main)/groups/[slug]/page.tsx       # 小组详情
/app/[locale]/(main)/groups/create/page.tsx       # 创建小组
/supabase/migrations/223_community_groups_and_group_id_on_posts.sql
```

---

## 用户成长体系

平台通过 **积分、等级、徽章** 激励用户活跃。

### 1. 积分系统 (User Points)

**积分获取**:
| 行为 | 积分 |
|------|------|
| 发布帖子 | +10 |
| 帖子被点赞 | +2 |
| 帖子被收藏 | +3 |
| 获得关注 | +5 |
| 商品被购买 | +20 |
| 完成订单 | +15 |

**积分表**: `user_points`
```sql
user_id UUID PRIMARY KEY
points INT DEFAULT 0
updated_at TIMESTAMPTZ
```

### 2. 等级系统 (Level)

等级由积分自动计算，无需单独存储：

| 等级 | 积分范围 | 称号 |
|------|----------|------|
| L1 | 0-99 | 新手 |
| L2 | 100-499 | 活跃 |
| L3 | 500-1999 | 资深 |
| L4 | 2000-4999 | 专家 |
| L5 | 5000-9999 | 大师 |
| L6+ | 10000+ | 传奇 |

**计算函数**:
```sql
level_from_points(p_points INT) RETURNS INT
```

### 3. 徽章系统 (Badges)

**徽章定义表**: `badges`
| 字段 | 说明 |
|------|------|
| `key` | 唯一标识 |
| `name` | 徽章名称 |
| `description` | 描述 |
| `icon_url` | 图标 |

**用户徽章表**: `user_badges`
| 字段 | 说明 |
|------|------|
| `user_id` | 用户ID |
| `badge_id` | 徽章ID |
| `earned_at` | 获得时间 |

**徽章类型示例**:
| 徽章 | 获得条件 |
|------|----------|
| `first_post` | 发布第一个帖子 |
| `popular_creator` | 获得 1000 个赞 |
| `top_seller` | 完成 100 笔订单 |
| `community_star` | 被 100 人关注 |
| `early_adopter` | 平台早期用户 |

**关键文件**:
```
/supabase/migrations/224_user_points_and_badges.sql
/supabase/migrations/229_user_points_award_on_post.sql
```

---

## 多模态内容支持

平台支持多种内容类型的帖子：

### 帖子类型 (post_type)

| 类型 | 说明 | 特殊字段 |
|------|------|----------|
| `normal` | 普通图文帖 | `image_urls`, `content` |
| `text` | 纯文字 | `content` |
| `image` | 图片集 | `image_urls` |
| `story` | 故事/连载 | `chapter_number`, `content_length`, `series_id` |
| `music` | 音乐 | `music_url`, `duration_seconds`, `cover_url` |
| `short_video` | 短视频 | `video_url`, `duration_seconds`, `cover_url` |
| `series` | 系列帖 | `series_id`, `series_order` |
| `affiliate` | 推广帖 | `product_id`, `affiliate_code` |

### 内容字段说明

**故事 (Story)**:
- `chapter_number`: 章节号
- `content_length`: 字数统计
- `series_id`: 所属系列ID

**音乐 (Music)**:
- `music_url`: 音频文件URL
- `duration_seconds`: 时长（秒）
- `cover_url`: 封面图

**短视频 (Short Video)**:
- `video_url`: 视频文件URL
- `duration_seconds`: 时长（秒）
- `cover_url`: 封面图

**关键文件**:
```
/supabase/migrations/225_post_type_extended.sql
/supabase/migrations/226_storage_music_and_short_videos_buckets.sql
```

---

## 数据库核心表结构

### 1. 用户相关

```sql
-- 用户资料
profiles (
  id UUID PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role TEXT CHECK (role IN ('user', 'seller', 'affiliate', 'admin', 'support')),
  seller_type TEXT CHECK (seller_type IN ('external', 'direct')),
  user_origin TEXT CHECK (user_origin IN ('external', 'internal')),
  subscription_tier INT,
  product_limit INT,
  follower_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 用户积分
user_points (
  user_id UUID PRIMARY KEY,
  points INT DEFAULT 0,
  updated_at TIMESTAMPTZ
)

-- 用户徽章
user_badges (
  id UUID PRIMARY KEY,
  user_id UUID,
  badge_id UUID,
  earned_at TIMESTAMPTZ
)
```

### 2. 内容相关

```sql
-- 帖子
posts (
  id UUID PRIMARY KEY,
  user_id UUID,
  content TEXT,
  image_urls TEXT[],
  post_type TEXT,
  series_id UUID,
  series_order INT,
  group_id UUID,
  topic_ids UUID[],
  location TEXT,
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')),
  content_lang TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 商品
products (
  id UUID PRIMARY KEY,
  seller_id UUID,
  name TEXT,
  description TEXT,
  price DECIMAL,
  currency TEXT,
  stock INT,
  images TEXT[],
  color_options JSONB,
  sizes TEXT[],
  category TEXT,
  condition TEXT,
  status TEXT CHECK (status IN ('pending', 'active', 'inactive', 'sold_out')),
  content_lang TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 评论
comments (
  id UUID PRIMARY KEY,
  post_id UUID,
  user_id UUID,
  content TEXT,
  parent_id UUID,
  like_count INT DEFAULT 0,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ
)
```

### 3. 社交相关

```sql
-- 关注
follows (
  id UUID PRIMARY KEY,
  follower_id UUID,
  followee_id UUID,
  created_at TIMESTAMPTZ,
  UNIQUE(follower_id, followee_id)
)

-- 点赞
likes (
  id UUID PRIMARY KEY,
  user_id UUID,
  post_id UUID,
  created_at TIMESTAMPTZ,
  UNIQUE(user_id, post_id)
)

-- 收藏
favorites (
  id UUID PRIMARY KEY,
  user_id UUID,
  post_id UUID,
  created_at TIMESTAMPTZ,
  UNIQUE(user_id, post_id)
)

-- 兴趣小组
community_groups (
  id UUID PRIMARY KEY,
  name TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  cover_url TEXT,
  created_by UUID,
  member_count INT DEFAULT 0,
  created_at TIMESTAMPTZ
)

-- 小组成员
group_members (
  id UUID PRIMARY KEY,
  group_id UUID,
  user_id UUID,
  role TEXT CHECK (role IN ('admin', 'moderator', 'member')),
  created_at TIMESTAMPTZ,
  UNIQUE(group_id, user_id)
)
```

### 4. 电商相关

```sql
-- 订单
orders (
  id UUID PRIMARY KEY,
  order_number TEXT UNIQUE,
  buyer_id UUID,
  seller_id UUID,
  product_id UUID,
  quantity INT,
  unit_price DECIMAL,
  total_amount DECIMAL,
  currency TEXT,
  payment_method TEXT,
  payment_status TEXT,
  order_status TEXT,
  seller_type_snapshot TEXT,
  funds_recipient TEXT,
  shipping_address JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 购物车 (客户端存储，也可服务端化)
-- 使用 Zustand 存储在 localStorage

-- 订阅
subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID,
  subscription_type TEXT,
  subscription_tier INT,
  status TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- 保证金批次
seller_deposit_lots (
  id UUID PRIMARY KEY,
  seller_id UUID,
  amount DECIMAL,
  currency TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
```

### 5. 支付相关

```sql
-- 支付交易
payment_transactions (
  id UUID PRIMARY KEY,
  type TEXT,
  provider TEXT,
  provider_ref TEXT,
  amount DECIMAL,
  currency TEXT,
  status TEXT,
  related_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ
)

-- 支付账户
payment_accounts (
  id UUID PRIMARY KEY,
  seller_id UUID,
  account_type TEXT,
  account_name TEXT,
  account_info JSONB,
  is_verified BOOLEAN,
  status TEXT,
  created_at TIMESTAMPTZ
)

-- 平台支付账户
platform_payment_accounts (
  id UUID PRIMARY KEY,
  account_type TEXT,
  currency TEXT,
  account_info JSONB,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
```

### 6. 通知相关

```sql
-- 通知
notifications (
  id UUID PRIMARY KEY,
  user_id UUID,
  type TEXT,
  title TEXT,
  content TEXT,
  data JSONB,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ
)
```

---

## RLS (Row Level Security) 策略

### 核心原则

1. **默认拒绝**: 所有表默认启用 RLS，无策略时拒绝访问
2. **最小权限**: 只授予必要的访问权限
3. **用户隔离**: 用户只能访问自己的数据
4. **Admin 特权**: Admin/Support 角色可访问特定数据

### 典型策略模式

```sql
-- 用户只能查看自己的记录
CREATE POLICY user_select_own
  ON table_name FOR SELECT
  USING (auth.uid() = user_id);

-- 用户只能插入自己的记录
CREATE POLICY user_insert_own
  ON table_name FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的记录
CREATE POLICY user_update_own
  ON table_name FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 用户只能删除自己的记录
CREATE POLICY user_delete_own
  ON table_name FOR DELETE
  USING (auth.uid() = user_id);

-- Admin 可查看所有记录
CREATE POLICY admin_select_all
  ON table_name FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- 公开可读
CREATE POLICY public_select
  ON table_name FOR SELECT
  USING (true);
```

### 特殊策略示例

**帖子表**:
```sql
-- 用户可查看已审核的帖子
CREATE POLICY posts_select_approved
  ON posts FOR SELECT
  USING (status = 'approved');

-- 作者可查看自己的所有帖子
CREATE POLICY posts_select_own
  ON posts FOR SELECT
  USING (auth.uid() = user_id);

-- Admin 可查看所有帖子
CREATE POLICY posts_select_admin
  ON posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );
```

**订单表**:
```sql
-- 买家或卖家可查看自己的订单
CREATE POLICY orders_select_own
  ON orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Admin 可查看所有订单
CREATE POLICY orders_select_admin
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );
```

### 绕过 RLS

**Service Role Key**: 用于服务端操作，绕过所有 RLS
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

**使用场景**:
- 定时任务 (Cron Jobs)
- Webhook 处理
- Admin 批量操作
- 系统级数据修复

---

## 更新日志

- **2024-02-10**: 创建完整开发指南
- 包含项目架构、开发规范、业务逻辑、常见问题
- 添加所有功能模块和联动链路
- 添加核心数据流说明
- 添加用户类型与卖家类型系统
- 添加支付系统详解
- 添加管理员后台系统
- 添加 Feed 推荐系统
- 添加社区与兴趣小组
- 添加用户成长体系
- 添加多模态内容支持
- 添加数据库核心表结构
- 添加 RLS 策略说明
