'use client'

import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useCartStore } from '@/store/cartStore'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { X, Plus, Minus, AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showError, showWarning } from '@/lib/utils/toast'
import { useCartValidation } from '@/lib/hooks/useCartValidation'
import type { ValidationResult } from '@/store/cartStore'

interface ProductInfo {
  id: string
  stock: number | null
  status: string
}

// 获取验证原因的中文文本
function getReasonText(reason?: ValidationResult['reason']): string {
  switch (reason) {
    case 'not_found':
      return '商品不存在'
    case 'inactive':
      return '商品已下架'
    case 'out_of_stock':
      return '库存不足'
    case 'price_changed':
      return '价格已变化'
    default:
      return '商品无效'
  }
}

export function ShoppingCart() {
  const router = useRouter()
  const {
    items,
    selectedIds,
    toggleSelect,
    selectAll,
    deselectAll,
    getSelectedTotal,
    getSelectedItems,
    removeItem,
    updateQuantity,
    clearCart,
    removeInvalidItems,
  } = useCartStore()
  const t = useTranslations('cart')
  const [productInfos, setProductInfos] = useState<Map<string, ProductInfo>>(new Map())
  const [loadingStocks, setLoadingStocks] = useState(false)
  const supabase = createClient()

  const selectedCount = selectedIds.length
  const selectedTotal = getSelectedTotal()
  const selectedItems = getSelectedItems()

  const allSelected = items.length > 0 && selectedCount === items.length
  const noneSelected = selectedCount === 0
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  // 默认全选：如果购物车有商品但没有任何选中状态，则自动全选
  useEffect(() => {
    if (items.length > 0 && selectedIds.length === 0) {
      selectAll()
    }
  }, [items.length, selectedIds.length, selectAll])

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = !allSelected && !noneSelected
  }, [allSelected, noneSelected])

  // 实时验证购物车商品
  const { invalidItems } = useCartValidation({
    enabled: items.length > 0,
    onInvalidItems: (invalid) => {
      if (invalid.length === 0) return

      // 获取无效商品的详细信息
      const invalidProductIds = invalid.map((item) => item.product_id)
      const invalidItemsWithNames = invalid.map((validation) => {
        const cartItem = items.find((i) => i.product_id === validation.product_id)
        return {
          ...validation,
          name: cartItem?.name || '未知商品',
        }
      })

      // 批量移除无效商品
      removeInvalidItems(invalidProductIds)

      // 显示提示信息
      if (invalidItemsWithNames.length === 1) {
        const item = invalidItemsWithNames[0]
        showWarning(`${item.name}: ${getReasonText(item.reason)}`)
      } else {
        const reasons = invalidItemsWithNames
          .map((item) => `${item.name}(${getReasonText(item.reason)})`)
          .join('、')
        showWarning(`已移除 ${invalidItemsWithNames.length} 个无效商品：${reasons}`)
      }
    },
  })

  // Fetch product stock and status information
  useEffect(() => {
    if (items.length === 0) {
      setProductInfos(new Map())
      return
    }

    const fetchProductInfos = async () => {
      setLoadingStocks(true)
      try {
        const productIds = items.map((item) => item.product_id)
        let query = supabase
          .from('products')
          .select('id, stock, status')

        if (productIds.length === 1) {
          query = query.eq('id', productIds[0])
        } else if (productIds.length > 1) {
          query = query.in('id', productIds)
        } else {
          return
        }

        const { data: products, error } = await query

        if (error) {
          console.error('Error fetching product info:', error)
          return
        }

        const infoMap = new Map<string, ProductInfo>()
        products?.forEach((product) => {
          infoMap.set(product.id, {
            id: product.id,
            stock: product.stock,
            status: product.status,
          })
        })
        setProductInfos(infoMap)
      } catch (error) {
        console.error('Error fetching product info:', error)
      } finally {
        setLoadingStocks(false)
      }
    }

    fetchProductInfos()
  }, [items, supabase])

  const handleIncreaseQuantity = (productId: string, currentQuantity: number) => {
    const productInfo = productInfos.get(productId)
    
    if (productInfo) {
      // Check if product is still available
      if (productInfo.status !== 'active') {
        showWarning('商品已下架，无法增加数量')
        return
      }

      // Check stock limit
      if (productInfo.stock !== null && productInfo.stock !== undefined) {
        if (currentQuantity >= productInfo.stock) {
          showError(`库存不足，最多只能购买 ${productInfo.stock} 件`)
          return
        }
        // Limit to available stock
        updateQuantity(productId, Math.min(currentQuantity + 1, productInfo.stock))
      } else {
        // No stock limit, allow increase
        updateQuantity(productId, currentQuantity + 1)
      }
    } else {
      // Product info not loaded yet, allow increase (will be validated later)
      updateQuantity(productId, currentQuantity + 1)
    }
  }

  const handleCheckout = () => {
    if (selectedItems.length > 0) {
      router.push('/checkout')
    }
  }

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              ref={selectAllRef}
              checked={allSelected && !noneSelected}
              onCheckedChange={(checked) => {
                if (checked) selectAll()
                else deselectAll()
              }}
              aria-label={allSelected ? t('deselectAll') : t('selectAll')}
            />
            <span className="text-sm">
              {allSelected ? t('deselectAll') : t('selectAll')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('selectedItems', { count: selectedCount })}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={clearCart} className="flex-shrink-0">
            <span className="hidden sm:inline">{t('clearCart')}</span>
            <span className="sm:hidden">{t('clear')}</span>
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-center text-muted-foreground">{t('emptyCart')}</p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.product_id} className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                  <div className="pt-1 sm:pt-0">
                    <Checkbox
                      checked={selectedIds.includes(item.product_id)}
                      onCheckedChange={() => toggleSelect(item.product_id)}
                      aria-label={`select ${item.name}`}
                    />
                  </div>
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-16 w-16 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      ¥{item.price.toFixed(2)}
                    </p>
                    {(() => {
                      const productInfo = productInfos.get(item.product_id)
                      if (productInfo) {
                        if (productInfo.status !== 'active') {
                          return (
                            <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3" />
                              商品已下架
                            </p>
                          )
                        }
                        if (productInfo.stock !== null && productInfo.stock !== undefined) {
                          const remainingStock = productInfo.stock - item.quantity
                          if (remainingStock < 0) {
                            return (
                              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                <AlertCircle className="h-3 w-3" />
                                库存不足（可用: {productInfo.stock}）
                              </p>
                            )
                          }
                          if (remainingStock < 5) {
                            return (
                              <p className="text-xs text-orange-500 mt-1">
                                仅剩 {productInfo.stock} 件
                              </p>
                            )
                          }
                          return (
                            <p className="text-xs text-muted-foreground mt-1">
                              库存: {productInfo.stock} 件
                            </p>
                          )
                        }
                      }
                      return null
                    })()}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleIncreaseQuantity(item.product_id, item.quantity)}
                        disabled={(() => {
                          const productInfo = productInfos.get(item.product_id)
                          if (productInfo) {
                            if (productInfo.status !== 'active') return true
                            if (productInfo.stock !== null && productInfo.stock !== undefined) {
                              return item.quantity >= productInfo.stock
                            }
                          }
                          return false
                        })()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeItem(item.product_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{t('selectedTotal')}</span>
              <span className="text-xl font-bold">
                ¥{selectedTotal.toFixed(2)}
              </span>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
            >
              {selectedItems.length === 0
                ? t('pleaseSelectItems')
                : t('checkoutSelected', { count: selectedItems.length })}
            </Button>
          </Card>
        </>
      )}
    </div>
  )
}
