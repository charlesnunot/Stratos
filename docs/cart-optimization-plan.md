# 购物车系统优化实施计划

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.2 |
| 创建日期 | 2026-02-14 |
| 更新日期 | 2026-02-14 |
| 作者 | AI Assistant |
| 状态 | 已完善（架构师审查版） |
| 审查状态 | 待架构师审查 |

---

## 一、现状分析

### 1.1 当前架构

| 组件 | 实现方式 | 状态 |
|------|---------|------|
| **购物车页面** (`/cart`) | 公开页面，无鉴权 | ✅ 符合电商逻辑 |
| **结算页面** (`/checkout`) | 使用 `useAuth` 检查，未登录跳转 `/login` | ⚠️ 需优化用户体验 |
| **数据存储** | Zustand + localStorage | ✅ 本地持久化 |
| **跨设备同步** | 无 | ❌ 缺失 |
| **登录后数据恢复** | 无 | ❌ 缺失 |
| **购物车验证** | `useCartValidation` Hook | ✅ 已存在 |

### 1.2 结算页当前鉴权逻辑

**文件位置**: `src/app/[locale]/(main)/checkout/page.tsx:220-230`

```typescript
// 等待认证状态加载
if (authLoading) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

// 认证加载完成后检查用户
if (!user) {
  router.push('/login')
  return null
}
```

**问题分析**:
- ❌ 直接跳转，无提示说明
- ❌ 购物车数据可能丢失
- ❌ 用户不清楚为什么被跳转
- ❌ 无返回/继续浏览的选项

### 1.3 购物车数据流（当前）

```
用户添加商品到购物车
    ↓
数据存储在 localStorage（通过 Zustand persist）
    ↓
访问 /cart 页面
    ↓
从 localStorage 读取购物车数据
    ↓
显示购物车内容
    ↓
点击"结算"
    ↓
跳转到 /checkout
    ↓
未登录 → 直接跳转 /login（购物车数据留在 localStorage）
    ↓
登录后 → 回到 /checkout（但用户可能迷失）
```

### 1.4 项目现有组件和工具分析

#### 1.4.1 认证系统

**AuthProvider** (`src/lib/providers/AuthProvider.tsx`):
- 使用 Supabase Auth 管理用户状态
- 提供 `user` 和 `loading` 状态
- 支持会话过期提示
- **注意**: 是 Client Component，可以直接使用 Hook

**useAuth Hook** (`src/lib/hooks/useAuth.ts`):
```typescript
export function useAuth() {
  const value = useContext(AuthContext)
  if (value === null && typeof window !== 'undefined') {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value ?? { user: null, loading: true }
}
```

**useAuthGuard Hook** (`src/lib/hooks/useAuthGuard.tsx`):
- 已支持 `redirect` 参数
- 自动跳转登录页并携带当前路径

#### 1.4.2 UI 组件

**Alert 组件** (`src/components/ui/alert.tsx`):
- 已存在，可用于提示信息
- 支持 `default` 和 `destructive` 变体

**Dialog 组件** (`src/components/ui/dialog.tsx`):
- 已存在，可用于登录引导弹窗
- 包含 Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription

**Button 组件** (`src/components/ui/button.tsx`):
- 已存在，支持多种变体

#### 1.4.3 购物车存储

**cartStore** (`src/store/cartStore.ts`):
- 使用 Zustand + persist 中间件
- 存储在 localStorage，key 为 `cart-storage`
- 数据结构：
```typescript
interface CartItem {
  product_id: string
  quantity: number
  price: number
  currency?: string
  name: string
  image: string
  color?: string | null      // 新增：颜色变体
  size?: string | null       // 新增：尺寸变体
}
```
- **重要**: 已支持 color/size 变体，通过 `isSameVariant` 函数判断是否为同一商品

**ShoppingCart 组件** (`src/components/ecommerce/ShoppingCart.tsx`):
- 使用 `useCartStore` 获取购物车数据
- 支持商品选择、数量修改、删除
- 实时验证商品有效性

**useCartValidation Hook** (`src/lib/hooks/useCartValidation.ts`):
- 已存在，用于实时验证购物车商品
- 自动检测库存不足、商品下架、价格变动
- 需要与同步功能集成

#### 1.4.4 通知系统

**Toast 工具函数** (`src/lib/utils/toast.ts`):
- `showInfo(message, title)` - 信息提示
- `showWarning(message)` - 警告提示
- `showError(message)` - 错误提示
- **注意**: 项目使用工具函数而非 toast hook

#### 1.4.5 国际化

**next-intl 配置**:
- 翻译文件位于 `src/messages/zh.json` 和 `src/messages/en.json`
- 使用 `useTranslations` Hook 获取翻译
- 购物车相关翻译在 `cart` namespace 下

#### 1.4.6 路由系统

**i18n 路由** (`src/i18n/navigation.ts`):
- 使用 next-intl 的路由封装
- 支持 `useRouter`, `usePathname`, `Link`
- 登录页支持 `redirect` 查询参数

**登录页** (`src/app/login/page.tsx`):
- 自动重定向到 `/{defaultLocale}/login`
- 保留 query 参数（如 `redirect=`）

---

## 二、优化目标

| 优先级 | 目标 | 业务价值 | 技术可行性 |
|--------|------|---------|-----------|
| **P0** | 优化结算页鉴权体验 | 减少用户流失，提高转化率 | 高 |
| **P1** | 实现购物车跨设备同步 | 提升用户体验，增加复购 | 中 |
| **P2** | 完善数据恢复机制 | 防止数据丢失，提升信任 | 高 |
| **P3** | 添加缓存提示引导 | 降低用户困惑，提升满意度 | 高 |

---

## 三、详细实施方案

### 阶段一：结算页鉴权体验优化（P0）

#### 3.1.1 设计登录引导组件

**分析**：项目已有 Dialog 和 Alert 组件，可直接使用。

**方案 A：使用 Dialog 弹窗（推荐）**

**新建文件**: `src/components/ecommerce/LoginPromptDialog.tsx`

```typescript
'use client'

import { useRouter } from '@/i18n/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShoppingCart, User, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface LoginPromptDialogProps {
  isOpen: boolean
  onClose: () => void
  itemCount: number
  redirectUrl: string
}

export function LoginPromptDialog({
  isOpen,
  onClose,
  itemCount,
  redirectUrl,
}: LoginPromptDialogProps) {
  const t = useTranslations('cart')
  const router = useRouter()

  const handleLogin = () => {
    // 保存购物车数据到 sessionStorage，确保登录后恢复
    const cartData = localStorage.getItem('cart-storage')
    if (cartData) {
      sessionStorage.setItem('pending_cart_data', cartData)
    }
    router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShoppingCart className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {t('loginToCheckout')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('loginToCheckoutDescription', { count: itemCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-3">
          <Button onClick={handleLogin} className="w-full gap-2">
            <User className="h-4 w-4" />
            {t('loginAndContinue')}
            <ArrowRight className="h-4 w-4" />
          </Button>

          <Button variant="outline" onClick={onClose} className="w-full">
            {t('continueBrowsing')}
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t('cartDataPreserved')}
        </p>
      </DialogContent>
    </Dialog>
  )
}
```

**方案 B：使用页面内提示（备选）**

如果希望更轻量的方案，可在页面内显示提示：

```typescript
// 在 checkout/page.tsx 中
if (!user) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 text-center">
      <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground/50" />
      <h1 className="mt-4 text-xl font-semibold">{t('checkoutRequiresLogin')}</h1>
      <p className="mt-2 text-muted-foreground">{t('pleaseLoginToContinue')}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={handleLogin} className="gap-2">
          <User className="h-4 w-4" />
          {t('loginAndContinue')}
        </Button>
        <Button variant="outline" onClick={() => router.push('/cart')}>
          {t('backToCart')}
        </Button>
      </div>
    </div>
  )
}
```

#### 3.1.2 修改结算页鉴权逻辑

**修改文件**: `src/app/[locale]/(main)/checkout/page.tsx`

**当前代码位置**: 约第 220-230 行

```typescript
// 1. 导入 LoginPromptDialog
import { LoginPromptDialog } from '@/components/ecommerce/LoginPromptDialog'
import { ShoppingCart, User } from 'lucide-react'

// 2. 在组件状态中添加
const [showLoginPrompt, setShowLoginPrompt] = useState(false)

// 3. 修改鉴权检查逻辑（替换原有的直接跳转）
// 等待认证状态加载
if (authLoading) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

// 认证加载完成后检查用户 - 显示引导页面而非直接跳转
if (!user) {
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-12 text-center">
        <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground/50" />
        <h1 className="mt-4 text-xl font-semibold">
          {t('checkoutRequiresLogin')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t('pleaseLoginToContinue')}
        </p>
        <Button
          onClick={() => setShowLoginPrompt(true)}
          className="mt-6 gap-2"
        >
          <User className="h-4 w-4" />
          {t('login')}
        </Button>
      </div>

      <LoginPromptDialog
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        itemCount={selectedItems.length}
        redirectUrl="/checkout"
      />
    </>
  )
}
```

#### 3.1.3 添加翻译键

**修改文件**: `src/messages/zh.json`

在 `cart` namespace 下添加：

```json
{
  "cart": {
    "loginToCheckout": "登录以继续结算",
    "loginToCheckoutDescription": "您有 {count} 件商品等待结算，登录后即可完成购买",
    "loginAndContinue": "登录并继续",
    "continueBrowsing": "继续浏览",
    "cartDataPreserved": "您的购物车数据将被保留",
    "checkoutRequiresLogin": "结算需要登录",
    "pleaseLoginToContinue": "请登录后继续完成您的订单",
    "backToCart": "返回购物车"
  }
}
```

**修改文件**: `src/messages/en.json`

```json
{
  "cart": {
    "loginToCheckout": "Login to Continue Checkout",
    "loginToCheckoutDescription": "You have {count} items waiting to checkout. Login to complete your purchase",
    "loginAndContinue": "Login & Continue",
    "continueBrowsing": "Continue Browsing",
    "cartDataPreserved": "Your cart data will be preserved",
    "checkoutRequiresLogin": "Login Required for Checkout",
    "pleaseLoginToContinue": "Please login to continue with your order",
    "backToCart": "Back to Cart"
  }
}
```

---

### 阶段二：购物车跨设备同步（P1）

#### 3.2.1 数据库表设计

**问题识别**: 原设计将 items 存储为 JSONB，但购物车商品有 color/size 变体，需要更精细的数据结构。

**方案**: 使用 JSONB 存储（推荐），原因：
1. 购物车数据结构灵活，不需要复杂查询
2. 单个用户的购物车商品数量有限（通常 < 100）
3. 减少表连接，提高读取性能
4. 与现有 cartStore 结构保持一致

**新建迁移文件**: `supabase/migrations/230_user_cart_sync.sql`

```sql
-- 用户购物车表（用于跨设备同步）
CREATE TABLE user_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]', -- 存储购物车项数组，包含 color/size 变体
  selected_ids TEXT[] DEFAULT '{}',  -- 选中的商品ID（注意：同一商品不同变体有相同 product_id）
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 启用RLS
ALTER TABLE user_carts ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的购物车数据
CREATE POLICY user_carts_select_own
  ON user_carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_carts_insert_own
  ON user_carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_carts_update_own
  ON user_carts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_carts_delete_own
  ON user_carts FOR DELETE
  USING (auth.uid() = user_id);

-- 创建索引
CREATE INDEX idx_user_carts_user_id ON user_carts(user_id);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_user_carts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_carts_updated_at
  BEFORE UPDATE ON user_carts
  FOR EACH ROW
  EXECUTE FUNCTION update_user_carts_updated_at();

-- 添加注释
COMMENT ON TABLE user_carts IS 'User shopping cart for cross-device synchronization';
COMMENT ON COLUMN user_carts.items IS 'Cart items array with color/size variants stored as JSONB';
COMMENT ON COLUMN user_carts.selected_ids IS 'Selected product IDs (note: same product with different variants share the same product_id)';
```

**执行迁移**:
```bash
# 使用 Supabase CLI 执行迁移
supabase db push
```

#### 3.2.2 创建购物车同步 Hook

**新建文件**: `src/lib/hooks/useCartSync.ts`

```typescript
'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'
import { useCartStore } from '@/store/cartStore'
import { createClient } from '@/lib/supabase/client'
import { showWarning } from '@/lib/utils/toast'

const SYNC_DEBOUNCE_MS = 5000 // 5秒防抖（原2秒过于频繁）
const SYNC_INTERVAL_MS = 60000 // 60秒定期同步

interface CartItem {
  product_id: string
  quantity: number
  price: number
  currency?: string
  name: string
  image: string
  color?: string | null
  size?: string | null
}

export function useCartSync() {
  const { user } = useAuth()
  const supabase = createClient()
  const cartStore = useCartStore()
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncRef = useRef<number>(0)
  const isLoadingRef = useRef(false)

  // 从服务器加载购物车
  const loadCartFromServer = useCallback(async () => {
    if (!user || isLoadingRef.current) return

    isLoadingRef.current = true
    try {
      const { data, error } = await supabase
        .from('user_carts')
        .select('items, selected_ids, updated_at')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = 无记录，不是错误
        console.error('Failed to load cart from server:', error)
        return
      }

      if (data) {
        const serverItems: CartItem[] = data.items || []
        const serverSelectedIds: string[] = data.selected_ids || []
        const serverUpdatedAt = new Date(data.updated_at || 0).getTime()
        const localUpdatedAt = lastSyncRef.current

        // 如果服务器数据较新，合并到本地
        if (serverUpdatedAt > localUpdatedAt && serverItems.length > 0) {
          // 合并策略：智能合并
          serverItems.forEach((serverItem) => {
            const localItem = cartStore.items.find(
              (i) =>
                i.product_id === serverItem.product_id &&
                i.color === serverItem.color &&
                i.size === serverItem.size
            )

            if (localItem) {
              // 如果本地数量更大，保留本地数量（用户可能刚刚修改）
              const maxQuantity = Math.max(localItem.quantity, serverItem.quantity)
              if (maxQuantity !== localItem.quantity) {
                cartStore.updateQuantity(
                  serverItem.product_id,
                  maxQuantity,
                  serverItem.color,
                  serverItem.size
                )
              }
            } else {
              // 添加服务器独有的商品
              cartStore.addItem(serverItem)
            }
          })

          // 合并选中状态（并集）
          serverSelectedIds.forEach((id: string) => {
            if (!cartStore.selectedIds.includes(id)) {
              cartStore.toggleSelect(id)
            }
          })

          // 如果有数据合并，提示用户
          if (serverItems.length > 0) {
            showWarning('已从其他设备同步购物车数据')
          }

          lastSyncRef.current = serverUpdatedAt
        }
      }
    } catch (error) {
      console.error('Error loading cart from server:', error)
    } finally {
      isLoadingRef.current = false
    }
  }, [user, supabase, cartStore])

  // 保存购物车到服务器
  const saveCartToServer = useCallback(async () => {
    if (!user || isLoadingRef.current) return

    try {
      const { error } = await supabase.from('user_carts').upsert(
        {
          user_id: user.id,
          items: cartStore.items,
          selected_ids: cartStore.selectedIds,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )

      if (error) {
        console.error('Failed to save cart to server:', error)
        return
      }

      lastSyncRef.current = Date.now()
    } catch (error) {
      console.error('Error saving cart to server:', error)
    }
  }, [user, supabase, cartStore])

  // 防抖同步
  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      saveCartToServer()
    }, SYNC_DEBOUNCE_MS)
  }, [saveCartToServer])

  // 用户登录时加载购物车
  useEffect(() => {
    if (user) {
      loadCartFromServer()
    }
  }, [user, loadCartFromServer])

  // 购物车变化时同步到服务器
  useEffect(() => {
    if (user) {
      debouncedSync()
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [user, cartStore.items, cartStore.selectedIds, debouncedSync])

  // 定期同步（每60秒）
  useEffect(() => {
    if (user) {
      intervalRef.current = setInterval(() => {
        saveCartToServer()
      }, SYNC_INTERVAL_MS)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [user, saveCartToServer])

  return {
    isSyncing: !!syncTimeoutRef.current,
    lastSync: lastSyncRef.current,
    forceSync: saveCartToServer,
  }
}
```

#### 3.2.3 在购物车页面启用同步

**修改文件**: `src/app/[locale]/(main)/cart/page.tsx`

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { ShoppingCart } from '@/components/ecommerce/ShoppingCart'
import { useCartSync } from '@/lib/hooks/useCartSync'
import { Loader2 } from 'lucide-react'

export default function CartPage() {
  const t = useTranslations('cart')

  // 启用购物车同步
  const { isSyncing } = useCartSync()

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <div className="mb-4 flex items-center justify-between md:mb-6">
        <h1 className="text-xl font-bold md:text-2xl">{t('pageTitle')}</h1>
        {isSyncing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('syncing')}
          </div>
        )}
      </div>
      <ShoppingCart />
    </div>
  )
}
```

---

### 阶段三：登录后数据恢复（P2）

#### 3.3.1 创建购物车恢复 Hook

**新建文件**: `src/lib/hooks/useCartRecovery.ts`

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { useCartStore } from '@/store/cartStore'
import { showInfo } from '@/lib/utils/toast'

interface CartItem {
  product_id: string
  quantity: number
  price: number
  currency?: string
  name: string
  image: string
  color?: string | null
  size?: string | null
}

const PENDING_CART_KEY = 'pending_cart_data'
const RECOVERY_DELAY_MS = 500 // 延迟恢复，确保其他初始化完成

export function useCartRecovery() {
  const { user, loading } = useAuth()
  const cartStore = useCartStore()
  const hasRecoveredRef = useRef(false)

  useEffect(() => {
    // 只在用户登录且认证加载完成后执行
    if (!user || loading || hasRecoveredRef.current) return

    // 检查是否有待恢复的购物车数据
    const pendingCartData = sessionStorage.getItem(PENDING_CART_KEY)
    if (!pendingCartData) return

    // 延迟恢复，确保其他初始化完成
    const timeoutId = setTimeout(() => {
      try {
        const parsedData = JSON.parse(pendingCartData)
        const pendingItems: CartItem[] = parsedData.state?.items || []
        const pendingSelectedIds: string[] = parsedData.state?.selectedIds || []

        if (pendingItems.length > 0) {
          let addedCount = 0
          let mergedCount = 0

          // 合并购物车数据
          pendingItems.forEach((item) => {
            const existingItem = cartStore.items.find(
              (i) =>
                i.product_id === item.product_id &&
                i.color === item.color &&
                i.size === item.size
            )

            if (existingItem) {
              // 更新数量（取最大值）
              const maxQuantity = Math.max(existingItem.quantity, item.quantity)
              if (maxQuantity !== existingItem.quantity) {
                cartStore.updateQuantity(
                  item.product_id,
                  maxQuantity,
                  item.color,
                  item.size
                )
                mergedCount++
              }
            } else {
              // 添加新商品
              cartStore.addItem(item)
              addedCount++
            }
          })

          // 恢复选中状态
          pendingSelectedIds.forEach((id: string) => {
            if (!cartStore.selectedIds.includes(id)) {
              cartStore.toggleSelect(id)
            }
          })

          // 清除临时数据
          sessionStorage.removeItem(PENDING_CART_KEY)
          hasRecoveredRef.current = true

          // 显示恢复提示
          if (addedCount > 0 || mergedCount > 0) {
            showInfo(`已恢复 ${addedCount} 件商品，合并 ${mergedCount} 件商品`)
          }
        }
      } catch (error) {
        console.error('Failed to recover cart data:', error)
        // 清除可能损坏的数据
        sessionStorage.removeItem(PENDING_CART_KEY)
      }
    }, RECOVERY_DELAY_MS)

    return () => clearTimeout(timeoutId)
  }, [user, loading, cartStore])

  // 用户登出时清理标记
  useEffect(() => {
    if (!user && !loading) {
      hasRecoveredRef.current = false
    }
  }, [user, loading])
}
```

#### 3.3.2 在应用根组件启用恢复

**分析**：项目使用 `AuthProvider` 包裹应用，可在其中启用恢复。

**修改文件**: `src/lib/providers/AuthProvider.tsx`

```typescript
// 在 AuthProvider 组件中添加
import { useCartRecovery } from '@/lib/hooks/useCartRecovery'

export function AuthProvider({ children }: { children: ReactNode }) {
  // ... 现有代码

  // 启用购物车数据恢复
  useCartRecovery()

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
```

**注意**：由于 `AuthProvider` 是 Client Component，可以直接使用 Hook。但需要确保 `useCartRecovery` 不会导致循环渲染。

---

### 阶段四：缓存提示引导（P3）

#### 3.4.1 创建购物车提示组件

**新建文件**: `src/components/ecommerce/CartStorageNotice.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { X, Info, Cloud } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/hooks/useAuth'

const STORAGE_KEY = 'cart_notice_dismissed'
const DISMISS_DURATION_DAYS = 7 // 7天内不再显示

export function CartStorageNotice() {
  const t = useTranslations('cart')
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 已登录用户不需要显示此提示
    if (user) {
      setIsVisible(false)
      return
    }

    // 检查是否已关闭
    const dismissedData = localStorage.getItem(STORAGE_KEY)
    if (dismissedData) {
      try {
        const { timestamp } = JSON.parse(dismissedData)
        const daysSinceDismissed = (Date.now() - timestamp) / (1000 * 60 * 60 * 24)
        if (daysSinceDismissed < DISMISS_DURATION_DAYS) {
          return
        }
      } catch {
        // 解析失败，继续显示
      }
    }

    // 检查购物车是否有商品
    const cartData = localStorage.getItem('cart-storage')
    if (cartData) {
      try {
        const parsed = JSON.parse(cartData)
        if (parsed.state?.items?.length > 0) {
          setIsVisible(true)
        }
      } catch {
        // 解析失败，不显示
      }
    }
  }, [user])

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ timestamp: Date.now() })
    )
  }

  if (!isVisible) return null

  return (
    <Alert className="mb-4">
      <Info className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Cloud className="h-4 w-4" />
        {t('cartStorageNotice')}
      </AlertTitle>
      <AlertDescription className="mt-2 flex items-start justify-between gap-4">
        <span>{t('cartStorageDescription')}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
```

#### 3.4.2 在购物车页面添加提示

**修改文件**: `src/app/[locale]/(main)/cart/page.tsx`

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { ShoppingCart } from '@/components/ecommerce/ShoppingCart'
import { useCartSync } from '@/lib/hooks/useCartSync'
import { CartStorageNotice } from '@/components/ecommerce/CartStorageNotice'
import { Loader2 } from 'lucide-react'

export default function CartPage() {
  const t = useTranslations('cart')

  // 启用购物车同步
  const { isSyncing } = useCartSync()

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <div className="mb-4 flex items-center justify-between md:mb-6">
        <h1 className="text-xl font-bold md:text-2xl">{t('pageTitle')}</h1>
        {isSyncing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('syncing')}
          </div>
        )}
      </div>
      
      {/* 缓存提示 */}
      <CartStorageNotice />
      
      <ShoppingCart />
    </div>
  )
}
```

#### 3.4.3 添加翻译键

**修改文件**: `src/messages/zh.json`

```json
{
  "cart": {
    "syncing": "同步中...",
    "cartStorageNotice": "购物车数据存储在本地",
    "cartStorageDescription": "登录后可将购物车数据同步到云端，实现跨设备访问"
  }
}
```

**修改文件**: `src/messages/en.json`

```json
{
  "cart": {
    "syncing": "Syncing...",
    "cartStorageNotice": "Cart data is stored locally",
    "cartStorageDescription": "Login to sync your cart to the cloud and access it across devices"
  }
}
```

---

## 四、实施时间表

| 阶段 | 任务 | 预计工时 | 依赖 |
|------|------|---------|------|
| **阶段一** | 结算页鉴权体验优化 | 4h | 无 |
| | 3.1.1 登录引导弹窗组件 | 1.5h | |
| | 3.1.2 修改结算页鉴权逻辑 | 1.5h | |
| | 3.1.3 添加翻译键 | 1h | |
| **阶段二** | 购物车跨设备同步 | 6h | 阶段一 |
| | 3.2.1 数据库表设计 | 1h | |
| | 3.2.2 创建购物车同步 Hook | 3h | |
| | 3.2.3 在购物车页面启用同步 | 1h | |
| | 3.2.4 测试同步功能 | 1h | |
| **阶段三** | 登录后数据恢复 | 3h | 阶段二 |
| | 3.3.1 创建购物车恢复 Hook | 1.5h | |
| | 3.3.2 在应用根组件启用恢复 | 0.5h | |
| | 3.3.3 测试数据恢复功能 | 1h | |
| **阶段四** | 缓存提示引导 | 2h | 阶段一 |
| | 3.4.1 创建购物车提示组件 | 1h | |
| | 3.4.2 在购物车页面添加提示 | 0.5h | |
| | 3.4.3 添加翻译键 | 0.5h | |
| **总计** | | **15h** | |

---

## 五、风险评估与缓解措施

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| **数据冲突** | 中 | 高 | 智能合并策略，保留最大数量；添加冲突提示 |
| **同步性能** | 低 | 中 | 5秒防抖 + 60秒定期同步；大数据量时批量处理 |
| **存储空间** | 低 | 低 | 购物车商品数量限制（建议50件）；定期清理无效数据 |
| **并发修改** | 低 | 高 | 使用 `updated_at` 时间戳；乐观锁策略 |
| **网络中断** | 中 | 中 | 本地存储优先；网络恢复后自动同步 |
| **数据丢失** | 低 | 高 | 多重备份（localStorage + sessionStorage + 服务器） |

---

## 六、测试计划

### 6.1 单元测试

| 测试项 | 测试内容 | 预期结果 |
|--------|---------|---------|
| `useCartSync` | 防抖同步 | 5秒内多次修改只同步一次 |
| `useCartSync` | 登录加载 | 登录后自动加载服务器购物车 |
| `useCartRecovery` | 数据恢复 | 登录后自动合并 sessionStorage 数据 |
| `LoginPromptDialog` | 登录跳转 | 正确保存购物车并跳转登录页 |

### 6.2 集成测试

| 测试场景 | 步骤 | 预期结果 |
|----------|------|---------|
| **未登录用户结算** | 1. 未登录添加商品<br>2. 访问 `/checkout`<br>3. 点击登录 | 显示引导页面，登录后回到结算页，购物车数据保留 |
| **跨设备同步** | 1. 设备A登录添加商品<br>2. 等待同步<br>3. 设备B登录 | 设备B显示设备A添加的商品 |
| **数据恢复** | 1. 未登录添加商品<br>2. 访问 `/checkout`<br>3. 点击登录<br>4. 登录成功 | 购物车数据自动恢复并合并 |
| **缓存提示** | 1. 清除 localStorage<br>2. 未登录访问 `/cart` | 显示缓存提示，关闭后7天内不再显示 |
| **并发修改** | 1. 设备A修改购物车<br>2. 设备B同时修改<br>3. 刷新页面 | 数据正确合并，无丢失 |
| **网络中断** | 1. 断开网络<br>2. 修改购物车<br>3. 恢复网络 | 修改保留在本地，网络恢复后自动同步 |

### 6.3 性能测试

| 测试项 | 测试数据 | 预期性能 |
|--------|---------|---------|
| 大数据量同步 | 50件商品 | 同步时间 < 2秒 |
| 频繁修改 | 10次/秒 | 防抖生效，只同步一次 |
| 并发用户 | 100用户 | 数据库响应时间 < 500ms |

---

## 七、架构设计图

### 7.1 当前购物车数据流

```
用户添加商品到购物车
    ↓
数据存储在 localStorage（通过 Zustand persist）
    ↓
访问 /cart 页面
    ↓
从 localStorage 读取购物车数据
    ↓
显示购物车内容
    ↓
点击"结算"
    ↓
跳转到 /checkout（可能需要登录）
```

### 7.2 优化后购物车数据流

```
用户添加商品到购物车
    ↓
数据存储在 localStorage + 同步到服务器（如果已登录）
    ↓
访问 /cart 页面
    ↓
从 localStorage 读取 + 从服务器同步（如果已登录）
    ↓
显示购物车内容
    ↓
点击"结算"
    ↓
如果未登录 → 显示登录引导弹窗 → 保存购物车到 sessionStorage
    ↓
登录后 → 从 sessionStorage 恢复购物车数据 → 继续结算
```

### 7.3 组件关系图

```
AuthProvider
    ├── useCartRecovery (登录后数据恢复)
    └── children
        ├── CartPage
        │   ├── useCartSync (购物车同步)
        │   ├── CartStorageNotice (缓存提示)
        │   └── ShoppingCart
        └── CheckoutPage
            └── LoginPromptDialog (登录引导)
```

---

## 八、相关文件索引

### 8.1 需要修改的文件

| 文件路径 | 修改内容 | 行数估算 |
|---------|---------|---------|
| `src/app/[locale]/(main)/checkout/page.tsx` | 优化鉴权逻辑，添加登录引导 | +30/-5 |
| `src/app/[locale]/(main)/cart/page.tsx` | 添加同步状态和存储提示 | +15/-2 |
| `src/lib/providers/AuthProvider.tsx` | 启用购物车恢复 | +3/-0 |
| `src/messages/zh.json` | 添加中文翻译键 | +15/-0 |
| `src/messages/en.json` | 添加英文翻译键 | +15/-0 |

### 8.2 需要新建的文件

| 文件路径 | 说明 | 行数估算 |
|---------|------|---------|
| `src/components/ecommerce/LoginPromptDialog.tsx` | 登录引导弹窗组件 | ~80 |
| `src/components/ecommerce/CartStorageNotice.tsx` | 购物车存储提示组件 | ~60 |
| `src/lib/hooks/useCartSync.ts` | 购物车同步 Hook | ~150 |
| `src/lib/hooks/useCartRecovery.ts` | 购物车恢复 Hook | ~70 |
| `supabase/migrations/230_user_cart_sync.sql` | 数据库迁移文件 | ~50 |

### 8.3 参考文件

| 文件路径 | 说明 |
|---------|------|
| `src/store/cartStore.ts` | 购物车状态管理 |
| `src/components/ecommerce/ShoppingCart.tsx` | 购物车组件 |
| `src/lib/hooks/useCartValidation.ts` | 购物车验证 Hook |
| `src/lib/hooks/useAuth.ts` | 认证 Hook |
| `src/lib/hooks/useAuthGuard.tsx` | 认证守卫 Hook |
| `src/lib/providers/AuthProvider.tsx` | 认证 Provider |
| `src/components/ui/alert.tsx` | Alert 组件 |
| `src/components/ui/dialog.tsx` | Dialog 组件 |
| `src/lib/utils/toast.ts` | Toast 工具函数 |

---

## 九、数据存储策略对比

| 存储位置 | 用途 | 生命周期 | 容量 | 可靠性 |
|---------|------|---------|------|--------|
| **localStorage** | 主要存储 | 永久（直到用户清除） | ~5MB | 高 |
| **sessionStorage** | 临时恢复数据 | 会话期间 | ~5MB | 中 |
| **Supabase** | 跨设备同步 | 永久 | 无限制 | 极高 |
| **内存** | 运行时状态 | 页面刷新后丢失 | 无限制 | 低 |

---

## 十、边界情况处理

| 场景 | 处理策略 |
|------|---------|
| **同一商品不同变体** | 使用 `product_id + color + size` 作为唯一标识 |
| **价格变动** | 保留购物车价格，结算时重新验证 |
| **库存不足** | 实时验证，自动移除或提示用户 |
| **商品下架** | 实时验证，自动移除无效商品 |
| **并发修改冲突** | 使用 `updated_at` 时间戳，保留最新数据 |
| **网络中断** | 本地存储优先，网络恢复后自动同步 |
| **大数据量** | 限制购物车商品数量（50件），超出时提示清理 |
| **用户登出** | 保留 localStorage，清理 sessionStorage |

---

## 十一、与现有系统集成

### 11.1 与 useCartValidation 集成

购物车同步 Hook 需要与现有的 `useCartValidation` 集成：

```typescript
// 在 useCartSync 中调用验证
const { invalidItems } = useCartValidation({
  enabled: items.length > 0,
  onInvalidItems: (invalid) => {
    // 同步前先清理无效商品
    removeInvalidItems(invalid.map(i => i.product_id))
  },
})
```

### 11.2 与 Toast 系统集成

使用项目现有的 Toast 工具函数：

```typescript
import { showInfo, showWarning, showError } from '@/lib/utils/toast'

// 同步成功
showInfo('购物车已同步')

// 数据恢复
showWarning('已从其他设备同步购物车数据')

// 同步失败
showError('同步失败，请稍后重试')
```

---

## 十二、附录

### 12.1 数据库 Schema

```sql
-- user_carts 表
CREATE TABLE user_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  selected_ids TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 索引
CREATE INDEX idx_user_carts_user_id ON user_carts(user_id);

-- RLS 策略
ALTER TABLE user_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_carts_select_own
  ON user_carts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_carts_insert_own
  ON user_carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_carts_update_own
  ON user_carts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_carts_delete_own
  ON user_carts FOR DELETE
  USING (auth.uid() = user_id);
```

### 12.2 测试用例详情

#### 用例 1：未登录用户结算
1. 未登录状态下添加商品到购物车
2. 访问 `/checkout`
3. 预期：显示登录引导页面，不自动跳转
4. 点击"登录并继续"
5. 预期：跳转到登录页，携带 redirect 参数
6. 登录成功
7. 预期：回到 `/checkout`，购物车数据保留

#### 用例 2：跨设备同步
1. 设备 A 登录用户，添加商品到购物车
2. 等待 5 秒（同步完成）
3. 设备 B 登录同一用户
4. 访问 `/cart`
5. 预期：显示设备 A 添加的商品

#### 用例 3：数据恢复
1. 未登录状态下添加商品到购物车
2. 访问 `/checkout`
3. 点击"登录并继续"
4. 登录成功
5. 预期：购物车数据自动恢复

#### 用例 4：缓存提示
1. 清除 localStorage
2. 未登录状态下访问 `/cart`
3. 预期：显示缓存提示
4. 点击关闭
5. 刷新页面
6. 预期：不再显示缓存提示

#### 用例 5：并发修改
1. 设备 A 登录用户，添加商品 X
2. 设备 B 登录同一用户，添加商品 Y
3. 设备 A 刷新页面
4. 预期：显示商品 X 和 Y

#### 用例 6：网络中断
1. 登录用户，添加商品到购物车
2. 断开网络
3. 修改购物车（添加/删除商品）
4. 恢复网络
5. 预期：网络恢复后自动同步

---

*文档结束*
