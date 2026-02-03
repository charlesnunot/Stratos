import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SupabaseClient } from '@supabase/supabase-js'

// 购物车操作审计日志（客户端）
function logCartAudit(action: string, productId: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    action,
    productId: productId.substring(0, 8) + '...', // 截断隐私保护
    timestamp,
    ...meta,
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('[CART AUDIT]', JSON.stringify(logEntry))
  }
  // 在生产环境中，可以发送到服务器端日志收集
}

interface CartItem {
  product_id: string
  quantity: number
  price: number
  name: string
  image: string
  currency?: string
  // Multi-language information
  contentLang?: 'zh' | 'en' | null
  nameTranslated?: string | null
}

export interface ValidationResult {
  product_id: string
  isValid: boolean
  reason?: 'out_of_stock' | 'inactive' | 'price_changed' | 'not_found'
  currentStock?: number
  currentPrice?: number
  currentStatus?: string
}

interface CartStore {
  items: CartItem[]
  selectedIds: string[]
  addItem: (item: CartItem) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateItemName: (productId: string, name: string) => void
  clearCart: () => void
  getTotal: () => number
  toggleSelect: (productId: string) => void
  selectAll: () => void
  deselectAll: () => void
  getSelectedItems: () => CartItem[]
  getSelectedTotal: () => number
  removeSelectedItems: () => void
  validateItems: (supabase: SupabaseClient) => Promise<ValidationResult[]>
  removeInvalidItems: (productIds: string[]) => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      selectedIds: [],
      addItem: (item) => {
        const existingItem = get().items.find(
          (i) => i.product_id === item.product_id
        )
        const selectedIds = get().selectedIds
        const ensureSelected = selectedIds.includes(item.product_id)
          ? selectedIds
          : [...selectedIds, item.product_id] // 默认全选：新增商品自动选中

        if (existingItem) {
          set({
            items: get().items.map((i) =>
              i.product_id === item.product_id
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
            selectedIds: ensureSelected,
          })
          logCartAudit('update_cart_quantity', item.product_id, { 
            newQuantity: existingItem.quantity + item.quantity 
          })
        } else {
          set({ items: [...get().items, item], selectedIds: ensureSelected })
          logCartAudit('add_to_cart', item.product_id, { quantity: item.quantity })
        }
      },
      removeItem: (productId) => {
        const selectedIds = get().selectedIds.filter((id) => id !== productId)
        set({
          items: get().items.filter((i) => i.product_id !== productId),
          selectedIds,
        })
        logCartAudit('remove_from_cart', productId)
      },
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
        } else {
          set({
            items: get().items.map((i) =>
              i.product_id === productId ? { ...i, quantity } : i
            ),
          })
          logCartAudit('update_cart_quantity', productId, { newQuantity: quantity })
        }
      },
      updateItemName: (productId, name) => {
        set({
          items: get().items.map((i) =>
            i.product_id === productId ? { ...i, name } : i
          ),
        })
      },
      clearCart: () => {
        const itemCount = get().items.length
        set({ items: [], selectedIds: [] })
        if (itemCount > 0) {
          logCartAudit('clear_cart', 'all', { removedCount: itemCount })
        }
      },
      getTotal: () => {
        return get().items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        )
      },
      toggleSelect: (productId) => {
        const selectedIds = get().selectedIds
        set({
          selectedIds: selectedIds.includes(productId)
            ? selectedIds.filter((id) => id !== productId)
            : [...selectedIds, productId],
        })
      },
      selectAll: () => {
        set({ selectedIds: get().items.map((i) => i.product_id) })
      },
      deselectAll: () => {
        set({ selectedIds: [] })
      },
      getSelectedItems: () => {
        const selected = new Set(get().selectedIds)
        return get().items.filter((i) => selected.has(i.product_id))
      },
      getSelectedTotal: () => {
        const selected = new Set(get().selectedIds)
        return get().items.reduce(
          (total, item) =>
            selected.has(item.product_id) ? total + item.price * item.quantity : total,
          0
        )
      },
      removeSelectedItems: () => {
        const selected = new Set(get().selectedIds)
        set({
          items: get().items.filter((i) => !selected.has(i.product_id)),
          selectedIds: [],
        })
      },
      validateItems: async (supabase) => {
        const items = get().items
        if (items.length === 0) return []

        const productIds = items.map((item) => item.product_id)
        let query = supabase
          .from('products')
          .select('id, stock, status, price')

        if (productIds.length === 1) {
          query = query.eq('id', productIds[0])
        } else if (productIds.length > 1) {
          query = query.in('id', productIds)
        } else {
          return []
        }

        const { data: products, error } = await query

        if (error) {
          console.error('Error validating cart items:', {
            error,
            errorCode: error.code,
            errorMessage: error.message,
            productIds,
            productIdsCount: productIds.length,
          })
          // 对于网络错误（CORS、502等），返回空数组而不是抛出错误
          // 这样可以避免阻塞购物车验证流程
          return []
        }

        const productMap = new Map(products?.map((p) => [p.id, p]) || [])
        const results: ValidationResult[] = []

        items.forEach((item) => {
          const product = productMap.get(item.product_id)
          if (!product) {
            results.push({
              product_id: item.product_id,
              isValid: false,
              reason: 'not_found',
            })
          } else if (product.status !== 'active') {
            results.push({
              product_id: item.product_id,
              isValid: false,
              reason: 'inactive',
              currentStatus: product.status,
            })
          } else if (product.stock !== null && product.stock < item.quantity) {
            results.push({
              product_id: item.product_id,
              isValid: false,
              reason: 'out_of_stock',
              currentStock: product.stock,
            })
          } else if (Math.abs(product.price - item.price) > 0.01) {
            results.push({
              product_id: item.product_id,
              isValid: false,
              reason: 'price_changed',
              currentPrice: product.price,
            })
          } else {
            results.push({
              product_id: item.product_id,
              isValid: true,
            })
          }
        })

        return results
      },
      removeInvalidItems: (productIds) => {
        const removeSet = new Set(productIds)
        set({
          items: get().items.filter((i) => !removeSet.has(i.product_id)),
          selectedIds: get().selectedIds.filter((id) => !removeSet.has(id)),
        })
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
