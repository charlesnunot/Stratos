import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SupabaseClient } from '@supabase/supabase-js'

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

function isSameVariant(
  a: { product_id: string; color?: string | null; size?: string | null },
  b: { product_id: string; color?: string | null; size?: string | null }
): boolean {
  return (
    a.product_id === b.product_id &&
    (a.color ?? null) === (b.color ?? null) &&
    (a.size ?? null) === (b.size ?? null)
  )
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
  removeItem: (productId: string, color?: string | null, size?: string | null) => void
  updateQuantity: (productId: string, quantity: number, color?: string | null, size?: string | null) => void
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
          (i) => isSameVariant(i, item)
        )
        const selectedIds = get().selectedIds
        const ensureSelected = selectedIds.includes(item.product_id)
          ? selectedIds
          : [...selectedIds, item.product_id] // 默认全选：新增商品自动选中

        if (existingItem) {
          set({
            items: get().items.map((i) =>
              isSameVariant(i, item)
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
            selectedIds: ensureSelected,
          })
        } else {
          set({ items: [...get().items, item], selectedIds: ensureSelected })
        }
      },
      removeItem: (productId, color, size) => {
        const filterFn =
          color !== undefined || size !== undefined
            ? (i: CartItem) =>
                i.product_id !== productId ||
                (i.color ?? null) !== (color ?? null) ||
                (i.size ?? null) !== (size ?? null)
            : (i: CartItem) => i.product_id !== productId
        const remaining = get().items.filter(filterFn)
        const removedIds = get().items.filter((i) => !filterFn(i)).map((i) => i.product_id)
        set({
          items: remaining,
          selectedIds: get().selectedIds.filter((id) => {
            const kept = remaining.some((i) => i.product_id === id)
            return kept || !removedIds.includes(id)
          }),
        })
      },
      updateQuantity: (productId, quantity, color, size) => {
        if (quantity <= 0) {
          get().removeItem(productId, color, size)
        } else {
          const filterFn =
            color !== undefined || size !== undefined
              ? (i: CartItem) =>
                  isSameVariant(i, { product_id: productId, color, size })
              : (i: CartItem) => i.product_id === productId
          set({
            items: get().items.map((i) =>
              filterFn(i) ? { ...i, quantity } : i
            ),
          })
        }
      },
      clearCart: () => set({ items: [], selectedIds: [] }),
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
          .select('id, stock, status, price, currency')

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
            const productCurrency = product.currency?.toUpperCase() || 'CNY'
            const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(productCurrency)
            const precision = isZeroDecimalCurrency ? 0 : 0.01
            
            if (Math.abs(product.price - item.price) > precision) {
              results.push({
                product_id: item.product_id,
                isValid: false,
                reason: 'price_changed',
                currentPrice: product.price,
              })
            }
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
