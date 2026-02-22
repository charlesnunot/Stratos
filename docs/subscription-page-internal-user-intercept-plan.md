# 订阅页面内部用户拦截实施计划

## 文档信息

- **版本**: 1.0
- **日期**: 2026-02-12
- **状态**: 实施中
- **作者**: AI Assistant

---

## 目录

1. [概述](#概述)
2. [业务背景](#业务背景)
3. [技术方案](#技术方案)
4. [实施步骤](#实施步骤)
5. [代码实现](#代码实现)
6. [翻译文案](#翻译文案)
7. [测试计划](#测试计划)
8. [验收标准](#验收标准)
9. [附录](#附录)

---

## 概述

### 问题描述

当前订阅页面（`/subscription/tip`、`/subscription/affiliate`、`/subscription/seller`）没有对内部用户进行拦截，导致：

1. 内部用户（`user_origin = 'internal'`）访问打赏/带货订阅页面时，看到不必要的购买界面
2. 直营卖家（`seller_type = 'direct'`）访问卖家订阅页面时，看到不必要的购买界面
3. 用户体验不佳，造成困惑

### 解决方案

在订阅页面顶部添加用户类型检测逻辑：
- **内部用户**访问打赏/带货订阅页面 → 显示友好提示，引导至功能页面
- **直营卖家**访问卖家订阅页面 → 显示友好提示，引导至卖家中心

### 实施范围

| 页面 | 用户类型 | 拦截条件 | 跳转目标 |
|------|----------|----------|----------|
| `/subscription/tip` | 内部用户 | `user_origin === 'internal'` | `/tip-center` |
| `/subscription/affiliate` | 内部用户 | `user_origin === 'internal'` | `/affiliate/products` |
| `/subscription/seller` | 直营卖家 | `seller_type === 'direct'` | `/seller/dashboard` |

---

## 业务背景

### 用户类型说明

#### 1. 外部用户
- **定义**: 普通注册用户，通过正常注册流程加入平台
- **订阅方式**: 需要付费订阅打赏、带货、卖家功能
- **数据库标识**: `user_origin` 为 `null` 或 `'external'`

#### 2. 内部用户
- **定义**: 平台内部员工或特殊用户，由管理员创建
- **订阅方式**: 无需付费订阅，由管理员在后台开通权限
- **数据库标识**: `user_origin === 'internal'`
- **特权**: 
  - 自动拥有打赏功能
  - 自动拥有带货功能
  - 无需订阅即可使用

#### 3. 直营卖家
- **定义**: 平台直营的商家账号，由管理员直接管理
- **订阅方式**: 无需付费订阅，由管理员在后台开通
- **数据库标识**: `seller_type === 'direct'`
- **特权**:
  - 无需订阅卖家功能
  - 拥有特殊的商品管理权限
  - 不占用普通卖家名额

### 拦截必要性

1. **用户体验**: 内部用户看到订阅页面会感到困惑，不明白为什么要付费
2. **业务逻辑**: 内部用户和直营卖家本来就不应该通过订阅页面购买功能
3. **权限管理**: 这些用户的权限由管理员在后台管理，与订阅系统分离
4. **防止误操作**: 避免内部用户意外进行不必要的支付

---

## 技术方案

### 方案选择: 友好提示模式（推荐）

**原理**: 在订阅页面检测用户类型，如果是内部用户/直营卖家，显示特殊提示卡片，引导用户到功能页面。

**优点**:
- ✅ 用户体验友好，不会造成困惑
- ✅ 明确告知用户已拥有权限及原因
- ✅ 提供直接跳转到功能页面的入口
- ✅ 保留管理订阅的入口（如果需要）
- ✅ 教育用户了解平台用户类型体系

**缺点**:
- 需要额外添加检测逻辑（已实现）
- 需要添加新的翻译文案（已完成）

### 替代方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **友好提示** | 透明、教育、灵活 | 需额外代码 | ⭐⭐⭐⭐⭐ |
| **自动重定向** | 简单、直接 | 用户困惑、无法查看订阅信息 | ⭐⭐ |
| **隐藏入口** | 用户看不到订阅按钮 | 需要修改多处UI | ⭐⭐⭐ |

---

## 实施步骤

### 阶段1: 准备工作（5分钟）

#### 1.1 确认数据库字段

确保 `profiles` 表有以下字段：

```sql
-- 检查字段是否存在
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('user_origin', 'seller_type');

-- 预期结果应包含:
-- user_origin (text)
-- seller_type (text)
```

#### 1.2 确认路由文件存在

确认以下文件存在：
- `src/app/[locale]/(main)/subscription/tip/page.tsx`
- `src/app/[locale]/(main)/subscription/affiliate/page.tsx`
- `src/app/[locale]/(main)/subscription/seller/page.tsx`

### 阶段2: 修改打赏订阅页面（15分钟）

#### 2.1 添加导入

文件: `src/app/[locale]/(main)/subscription/tip/page.tsx`

在现有导入后添加：

```typescript
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
```

#### 2.2 添加用户类型检测逻辑

在组件内添加：

```typescript
export default function TipSubscriptionPage() {
  // ... 现有状态
  
  const [isInternalUser, setIsInternalUser] = useState(false)
  const [isCheckingUserType, setIsCheckingUserType] = useState(true)
  
  useEffect(() => {
    const checkUserType = async () => {
      if (!user) {
        setIsCheckingUserType(false)
        return
      }
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_origin')
          .eq('id', user.id)
          .single()
        
        if (profile?.user_origin === 'internal') {
          setIsInternalUser(true)
        }
      } catch (error) {
        console.error('Error checking user type:', error)
      } finally {
        setIsCheckingUserType(false)
      }
    }
    
    checkUserType()
  }, [user, supabase])
  
  // ... 其他代码
}
```

#### 2.3 添加内部用户提示UI

在 return 语句开始处添加：

```typescript
// 加载中状态
if (isCheckingUserType) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

// 内部用户提示
if (isInternalUser) {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <Card className="p-8 text-center">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-4 text-sm">
            {t('internalUserBadge')}
          </Badge>
          <h2 className="text-2xl font-bold mb-2">
            {t('internalUserTipTitle')}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('internalUserTipDescription')}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/tip-center">
            <Button size="lg" className="w-full sm:w-auto">
              {t('goToTipCenter')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/subscription/manage">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              {t('manageSubscription')}
            </Button>
          </Link>
        </div>
        
        <div className="mt-6 pt-6 border-t">
          <p className="text-sm text-muted-foreground">
            {t('internalUserQuestions')}
          </p>
        </div>
      </Card>
    </div>
  )
}

// ... 正常的订阅页面内容
```

### 阶段3: 修改带货订阅页面（15分钟）

文件: `src/app/[locale]/(main)/subscription/affiliate/page.tsx`

步骤与阶段2相同，只需修改：
- 翻译键名：`internalUserAffiliateTitle`、`internalUserAffiliateDescription`
- 跳转目标：`/affiliate/products`
- 按钮文字：`t('goToAffiliateCenter')`

### 阶段4: 修改卖家订阅页面（15分钟）

文件: `src/app/[locale]/(main)/subscription/seller/page.tsx`

#### 4.1 检测逻辑修改

```typescript
const [isDirectSeller, setIsDirectSeller] = useState(false)

useEffect(() => {
  const checkUserType = async () => {
    if (!user) {
      setIsCheckingUserType(false)
      return
    }
    
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('seller_type')
        .eq('id', user.id)
        .single()
      
      if (profile?.seller_type === 'direct') {
        setIsDirectSeller(true)
      }
    } catch (error) {
      console.error('Error checking user type:', error)
    } finally {
      setIsCheckingUserType(false)
    }
  }
  
  checkUserType()
}, [user, supabase])
```

#### 4.2 UI修改

```typescript
if (isDirectSeller) {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <Card className="p-8 text-center">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-4 text-sm">
            {t('directSellerBadge')}
          </Badge>
          <h2 className="text-2xl font-bold mb-2">
            {t('directSellerTitle')}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('directSellerDescription')}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/seller/dashboard">
            <Button size="lg" className="w-full sm:w-auto">
              {t('goToSellerCenter')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/subscription/manage">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              {t('manageSubscription')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
```

### 阶段5: 添加翻译文案（10分钟）

#### 5.1 英文翻译 (en.json)

```json
{
  "subscription": {
    // ... 现有翻译
    
    "internalUserBadge": "Internal User",
    "internalUserTipTitle": "You Already Have Tipping Access",
    "internalUserTipDescription": "As an internal user, you don't need to subscribe to use the tipping feature. You can manage your tipping settings directly in the Tip Center.",
    "internalUserAffiliateTitle": "You Already Have Affiliate Access",
    "internalUserAffiliateDescription": "As an internal user, you don't need to subscribe to use the affiliate feature. You can start promoting products right away.",
    "directSellerBadge": "Direct Seller",
    "directSellerTitle": "You Are a Direct Seller",
    "directSellerDescription": "As a direct seller, you don't need to subscribe to sell products. You can manage your products directly in the Seller Center.",
    "goToTipCenter": "Go to Tip Center",
    "goToAffiliateCenter": "Go to Affiliate Center",
    "goToSellerCenter": "Go to Seller Center",
    "manageSubscription": "Manage Subscription",
    "internalUserQuestions": "Have questions? Contact your administrator for assistance."
  }
}
```

#### 5.2 中文翻译 (zh.json)

```json
{
  "subscription": {
    // ... 现有翻译
    
    "internalUserBadge": "内部用户",
    "internalUserTipTitle": "您已拥有打赏功能权限",
    "internalUserTipDescription": "作为内部用户，您无需订阅即可使用打赏功能。您可以直接进入打赏中心管理您的打赏设置。",
    "internalUserAffiliateTitle": "您已拥有带货功能权限",
    "internalUserAffiliateDescription": "作为内部用户，您无需订阅即可使用带货功能。您可以立即开始推广商品赚取佣金。",
    "directSellerBadge": "直营卖家",
    "directSellerTitle": "您是直营卖家",
    "directSellerDescription": "作为直营卖家，您无需订阅即可销售商品。您可以直接进入卖家中心管理您的商品。",
    "goToTipCenter": "进入打赏中心",
    "goToAffiliateCenter": "进入带货中心",
    "goToSellerCenter": "进入卖家中心",
    "manageSubscription": "管理订阅",
    "internalUserQuestions": "有疑问？请联系管理员获取帮助。"
  }
}
```

---

## 代码实现

### 完整代码示例：打赏订阅页面

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function TipSubscriptionPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('subscription')
  const locale = useLocale()
  
  // 用户类型检测
  const [isInternalUser, setIsInternalUser] = useState(false)
  const [isCheckingUserType, setIsCheckingUserType] = useState(true)
  
  useEffect(() => {
    const checkUserType = async () => {
      if (!user) {
        setIsCheckingUserType(false)
        return
      }
      
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('user_origin')
          .eq('id', user.id)
          .single()
        
        if (error) throw error
        
        if (profile?.user_origin === 'internal') {
          setIsInternalUser(true)
        }
      } catch (error) {
        console.error('Error checking user type:', error)
      } finally {
        setIsCheckingUserType(false)
      }
    }
    
    checkUserType()
  }, [user, supabase])
  
  // 加载中状态
  if (isCheckingUserType) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  
  // 内部用户提示
  if (isInternalUser) {
    return (
      <div className="mx-auto max-w-2xl py-12 px-4">
        <Card className="p-8 text-center">
          <div className="mb-6">
            <Badge variant="secondary" className="mb-4 text-sm px-3 py-1">
              {t('internalUserBadge')}
            </Badge>
            <h2 className="text-2xl font-bold mb-3">
              {t('internalUserTipTitle')}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
              {t('internalUserTipDescription')}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Link href="/tip-center">
              <Button size="lg" className="w-full sm:w-auto gap-2">
                {t('goToTipCenter')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/subscription/manage">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                {t('manageSubscription')}
              </Button>
            </Link>
          </div>
          
          <div className="pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {t('internalUserQuestions')}
            </p>
          </div>
        </Card>
      </div>
    )
  }
  
  // ... 正常的订阅页面内容
}
```

---

## 翻译文案

### 翻译键汇总表

| 键名 | 英文 | 中文 | 使用位置 |
|------|------|------|----------|
| `internalUserBadge` | Internal User | 内部用户 | 所有内部用户页面 |
| `internalUserTipTitle` | You Already Have Tipping Access | 您已拥有打赏功能权限 | Tip页面 |
| `internalUserTipDescription` | As an internal user... | 作为内部用户... | Tip页面 |
| `internalUserAffiliateTitle` | You Already Have Affiliate Access | 您已拥有带货功能权限 | Affiliate页面 |
| `internalUserAffiliateDescription` | As an internal user... | 作为内部用户... | Affiliate页面 |
| `directSellerBadge` | Direct Seller | 直营卖家 | Seller页面 |
| `directSellerTitle` | You Are a Direct Seller | 您是直营卖家 | Seller页面 |
| `directSellerDescription` | As a direct seller... | 作为直营卖家... | Seller页面 |
| `goToTipCenter` | Go to Tip Center | 进入打赏中心 | Tip页面 |
| `goToAffiliateCenter` | Go to Affiliate Center | 进入带货中心 | Affiliate页面 |
| `goToSellerCenter` | Go to Seller Center | 进入卖家中心 | Seller页面 |
| `manageSubscription` | Manage Subscription | 管理订阅 | 所有页面 |
| `internalUserQuestions` | Have questions?... | 有疑问？... | 所有页面 |

---

## 测试计划

### 测试场景

#### 场景1: 内部用户访问打赏订阅页面

**前置条件**:
- 用户已登录
- 用户 `user_origin` = 'internal'
- 用户未订阅打赏功能

**测试步骤**:
1. 访问 `/subscription/tip`
2. 观察页面显示

**预期结果**:
- 显示内部用户提示卡片
- 不显示购买界面
- 显示"进入打赏中心"按钮
- 显示"管理订阅"按钮
- 徽章显示"内部用户"

**验证通过标准**:
- [ ] 页面未显示订阅购买选项
- [ ] 显示正确的提示信息
- [ ] 按钮可点击并正确跳转
- [ ] 响应式布局正常

#### 场景2: 外部用户访问打赏订阅页面

**前置条件**:
- 用户已登录
- 用户 `user_origin` = null 或 'external'

**测试步骤**:
1. 访问 `/subscription/tip`
2. 观察页面显示

**预期结果**:
- 正常显示订阅购买界面
- 不显示内部用户提示

**验证通过标准**:
- [ ] 正常显示订阅购买选项
- [ ] 可选择档位并支付

#### 场景3: 直营卖家访问卖家订阅页面

**前置条件**:
- 用户已登录
- 用户 `seller_type` = 'direct'

**测试步骤**:
1. 访问 `/subscription/seller`
2. 观察页面显示

**预期结果**:
- 显示直营卖家提示卡片
- 不显示购买界面
- 显示"进入卖家中心"按钮
- 徽章显示"直营卖家"

**验证通过标准**:
- [ ] 页面未显示订阅购买选项
- [ ] 显示"您是直营卖家"提示
- [ ] 按钮可点击并正确跳转

#### 场景4: 未登录用户访问

**前置条件**:
- 用户未登录

**测试步骤**:
1. 访问 `/subscription/tip`

**预期结果**:
- 正常显示订阅页面（或重定向到登录）
- 不显示内部用户提示

#### 场景5: 中英文切换

**测试步骤**:
1. 切换语言到英文
2. 访问订阅页面
3. 切换语言到中文
4. 再次访问

**预期结果**:
- 英文环境显示英文提示
- 中文环境显示中文提示
- 所有文案正确翻译

---

## 验收标准

### 功能验收

- [ ] 内部用户访问打赏页面显示友好提示
- [ ] 内部用户访问带货页面显示友好提示
- [ ] 直营卖家访问卖家页面显示友好提示
- [ ] 外部用户正常看到订阅购买界面
- [ ] 未登录用户正常看到订阅页面或登录页
- [ ] 所有按钮可点击并正确跳转
- [ ] 响应式设计在移动端正常显示

### 性能验收

- [ ] 用户类型检测在 500ms 内完成
- [ ] 页面加载时间 < 2秒
- [ ] 不出现明显的加载闪烁

### 代码质量验收

- [ ] TypeScript 无错误
- [ ] 代码符合项目规范
- [ ] 错误处理完善
- [ ] 翻译文案完整

### 用户体验验收

- [ ] 提示信息清晰易懂
- [ ] 按钮位置合理
- [ ] 视觉设计美观
- [ ] 动画过渡自然

---

## 附录

### 数据库查询参考

```sql
-- 查询内部用户
SELECT id, username, user_origin 
FROM profiles 
WHERE user_origin = 'internal';

-- 查询直营卖家
SELECT id, username, seller_type 
FROM profiles 
WHERE seller_type = 'direct';

-- 查询同时是内部用户和直营卖家的用户
SELECT id, username, user_origin, seller_type 
FROM profiles 
WHERE user_origin = 'internal' 
AND seller_type = 'direct';
```

### 相关文件清单

**需要修改的文件**:
1. `src/app/[locale]/(main)/subscription/tip/page.tsx`
2. `src/app/[locale]/(main)/subscription/affiliate/page.tsx`
3. `src/app/[locale]/(main)/subscription/seller/page.tsx`

**需要添加翻译的文件**:
1. `src/messages/en.json`
2. `src/messages/zh.json`

**依赖的组件**:
- `Card` - 提示卡片容器
- `Button` - 操作按钮
- `Badge` - 用户类型徽章
- `Loader2` - 加载动画

### 回滚方案

如需回滚更改：

1. 从 Git 恢复原始文件
2. 移除添加的翻译键
3. 重启开发服务器清除缓存

```bash
# 恢复单个文件
git checkout src/app/[locale]/(main)/subscription/tip/page.tsx
git checkout src/app/[locale]/(main)/subscription/affiliate/page.tsx
git checkout src/app/[locale]/(main)/subscription/seller/page.tsx

# 恢复翻译文件
git checkout src/messages/en.json
git checkout src/messages/zh.json
```

---

## 更新记录

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-02-12 | 初始版本 | AI Assistant |

---

## 联系与支持

如有问题或建议，请联系：
- 技术负责人
- 产品经理
- 或创建 GitHub Issue

---

**文档结束**
