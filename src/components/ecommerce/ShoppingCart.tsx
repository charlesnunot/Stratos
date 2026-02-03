'use client'

import { useRouter } from '@/i18n/navigation'
import { Link } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useCartStore } from '@/store/cartStore'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { CartItemSkeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { X, Plus, Minus, AlertCircle, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showError, showWarning } from '@/lib/utils/toast'
import { useCartValidation } from '@/lib/hooks/useCartValidation'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { formatCurrency } from '@/lib/currency/format-currency'
import { convertCurrency } from '@/lib/currency/convert-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import type { ValidationResult } from '@/store/cartStore'

interface ProductInfo {
  id: string
  stock: number | null
  status: string
}

interface ProductMultiLangInfo {
  id: string
  name: string
  nameTranslated: string | null
  contentLang: 'zh' | 'en' | null
}

// 获取验证原因的翻译键（在组件内使用 t() 翻译）
function getReasonKey(reason?: ValidationResult['reason']): string {
  switch (reason) {
    case 'not_found':
      return 'reasonNotFound'
    case 'inactive':
      return 'reasonInactive'
    case 'out_of_stock':
      return 'reasonOutOfStock'
    case 'price_changed':
      return 'reasonPriceChanged'
    default:
      return 'reasonInvalid'
  }
}

export function ShoppingCart() {
  const router = useRouter()
  const locale = useLocale()
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
    updateItemName,
  } = useCartStore()
  const t = useTranslations('cart')
  const tCommon = useTranslations('common')
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [productInfos, setProductInfos] = useState<Map<string, ProductInfo>>(new Map())
  const [productMultiLangInfos, setProductMultiLangInfos] = useState<Map<string, ProductMultiLangInfo>>(new Map())
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [loadingMultiLang, setLoadingMultiLang] = useState(false)
  const [syncError, setSyncError] = useState(false)
  const supabase = createClient()

  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
  const selectedCount = selectedIds.length
  const selectedTotal = getSelectedTotal()
  const selectedItems = getSelectedItems()
  const selectedTotalDisplay = useMemo(() => {
    if (selectedItems.length === 0) return formatCurrency(0, userCurrency)
    const sum = selectedItems.reduce(
      (acc, item) =>
        acc + convertCurrency(item.price * item.quantity, (item.currency as Currency) || 'USD', userCurrency),
      0
    )
    return formatCurrency(sum, userCurrency)
  }, [selectedItems, userCurrency])

  const allSelected = items.length > 0 && selectedCount === items.length
  const noneSelected = selectedCount === 0
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const didInitialSelectRef = useRef(false)

  // 仅在有商品且从未做过「初始全选」时自动全选一次；用户主动取消全选后不再自动全选
  useEffect(() => {
    if (items.length === 0) {
      didInitialSelectRef.current = false
      return
    }
    if (selectedIds.length === 0 && !didInitialSelectRef.current) {
      selectAll()
      didInitialSelectRef.current = true
    }
  }, [items.length, selectedIds.length, selectAll])

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = !allSelected && !noneSelected
  }, [allSelected, noneSelected])

  // 稳定 onInvalidItems 引用，避免 useCartValidation 内依赖 validate 的 effect 每轮都跑导致循环
  const onInvalidItems = useCallback(
    (invalid: ValidationResult[]) => {
      if (invalid.length === 0) return
      const currentItems = useCartStore.getState().items
      const invalidProductIds = invalid.map((item) => item.product_id)
      const invalidItemsWithNames = invalid.map((validation) => {
        const cartItem = currentItems.find((i) => i.product_id === validation.product_id)
        return {
          ...validation,
          name: cartItem?.name || t('unknownProduct'),
          reasonText: t(getReasonKey(validation.reason)),
        }
      })
      removeInvalidItems(invalidProductIds)
      if (invalidItemsWithNames.length === 1) {
        const item = invalidItemsWithNames[0]
        showWarning(`${item.name}: ${item.reasonText}`)
      } else {
        const reasons = invalidItemsWithNames
          .map((item) => `${item.name}(${item.reasonText})`)
          .join('、')
        showWarning(t('removedInvalidItems', { count: invalidItemsWithNames.length, reasons }))
      }
    },
    [removeInvalidItems, t]
  )

  const { invalidItems, isValidating } = useCartValidation({
    enabled: items.length > 0,
    onInvalidItems,
  })

  // 仅当购物车中的商品 ID 集合变化时触发拉取，避免 updateItemName 更新 items 引用导致循环
  const productIdsKey = useMemo(
    () => items.map((i) => i.product_id).sort().join(','),
    [items]
  )

  const fetchProductInfos = useCallback(async () => {
    const currentItems = useCartStore.getState().items
    if (currentItems.length === 0) {
      setProductInfos(new Map())
      return
    }
    setLoadingStocks(true)
    try {
      setSyncError(false)
      const productIds = currentItems.map((item) => item.product_id)
      let query = supabase.from('products').select('id, stock, status')
      if (productIds.length === 1) query = query.eq('id', productIds[0])
      else if (productIds.length > 1) query = query.in('id', productIds)
      else return
      const { data: products, error } = await query
      if (error) {
        console.error('Error fetching product info:', error)
        setSyncError(true)
        showError(t('syncFailed'))
        return
      }
      const infoMap = new Map<string, ProductInfo>()
      products?.forEach((product) => {
        infoMap.set(product.id, { id: product.id, stock: product.stock, status: product.status })
      })
      setProductInfos(infoMap)
    } catch (error) {
      console.error('Error fetching product info:', error)
      setSyncError(true)
      showError(t('syncFailed'))
    } finally {
      setLoadingStocks(false)
    }
  }, [supabase, t])

  const fetchProductMultiLangInfos = useCallback(async () => {
    const currentItems = useCartStore.getState().items
    if (currentItems.length === 0) {
      setProductMultiLangInfos(new Map())
      return
    }
    setLoadingMultiLang(true)
    try {
      setSyncError(false)
      const productIds = currentItems.map((item) => item.product_id)
      let query = supabase.from('products').select('id, name, name_translated, content_lang')
      if (productIds.length === 1) query = query.eq('id', productIds[0])
      else if (productIds.length > 1) query = query.in('id', productIds)
      else return
      const { data: products, error } = await query
      if (error) {
        console.error('Error fetching product multi-language info:', error)
        setSyncError(true)
        showError(t('syncFailed'))
        return
      }
      const infoMap = new Map<string, ProductMultiLangInfo>()
      products?.forEach((product) => {
        infoMap.set(product.id, {
          id: product.id,
          name: product.name,
          nameTranslated: product.name_translated,
          contentLang: product.content_lang,
        })
      })
      setProductMultiLangInfos(infoMap)
    } catch (error) {
      console.error('Error fetching product multi-language info:', error)
      setSyncError(true)
      showError(t('syncFailed'))
    } finally {
      setLoadingMultiLang(false)
    }
  }, [supabase, t])

  useEffect(() => {
    if (items.length === 0) {
      setProductInfos(new Map())
      setProductMultiLangInfos(new Map())
      return
    }
    fetchProductInfos()
    fetchProductMultiLangInfos()
  }, [productIdsKey, fetchProductInfos, fetchProductMultiLangInfos])

  const handleRetrySync = () => {
    setSyncError(false)
    fetchProductInfos()
    fetchProductMultiLangInfos()
  }

  // 仅当 locale 或 productMultiLangInfos 变化时同步名称，不依赖 items，避免 updateItemName 更新 store 后 effect 再次执行造成循环
  useEffect(() => {
    const currentItems = useCartStore.getState().items
    if (currentItems.length === 0 || productMultiLangInfos.size === 0) return

    const productIds = currentItems.map((item) => item.product_id)
    const currentItemNames = new Map(currentItems.map((item) => [item.product_id, item.name]))

    productIds.forEach((productId) => {
      const multiLangInfo = productMultiLangInfos.get(productId)
      const currentName = currentItemNames.get(productId)

      if (multiLangInfo && currentName) {
        const displayName = getDisplayContent(
          locale,
          multiLangInfo.contentLang,
          multiLangInfo.name,
          multiLangInfo.nameTranslated
        )
        if (currentName !== displayName) {
          updateItemName(productId, displayName)
        }
      }
    })
  }, [locale, productMultiLangInfos, updateItemName])

  const handleIncreaseQuantity = (productId: string, currentQuantity: number) => {
    const productInfo = productInfos.get(productId)
    
    if (productInfo) {
      // Check if product is still available
      if (productInfo.status !== 'active') {
        showWarning(t('productInactiveCannotIncrease'))
        return
      }

      // Check stock limit
      if (productInfo.stock !== null && productInfo.stock !== undefined) {
        if (currentQuantity >= productInfo.stock) {
          showError(t('stockLimitReached', { stock: productInfo.stock }))
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
              disabled={loadingStocks || loadingMultiLang || isValidating}
            />
            <span className="text-sm">
              {allSelected ? t('deselectAll') : t('selectAll')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('selectedItems', { count: selectedCount })}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearDialog(true)}
            className="flex-shrink-0"
            disabled={loadingStocks || loadingMultiLang || isValidating}
          >
            <span className="hidden sm:inline">{t('clearCart')}</span>
            <span className="sm:hidden">{t('clear')}</span>
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState title={t('emptyCart')} description={t('emptyCartDescription')}>
          <Link href="/products">
            <Button variant="default">{t('browseProducts')}</Button>
          </Link>
        </EmptyState>
      ) : (
        <>
          {syncError && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
              <span className="text-sm text-destructive">{t('syncFailed')}</span>
              <Button variant="outline" size="sm" onClick={handleRetrySync}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {tCommon('retry')}
              </Button>
            </div>
          )}
          {loadingStocks || loadingMultiLang ? (
            <div className="space-y-2">
              {[...Array(Math.min(items.length, 5))].map((_, i) => (
                <CartItemSkeleton key={i} />
              ))}
            </div>
          ) : (
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
                      {formatPriceWithConversion(item.price, (item.currency as Currency) || 'USD', userCurrency).main}
                    </p>
                    {(() => {
                      const productInfo = productInfos.get(item.product_id)
                      if (productInfo) {
                        if (productInfo.status !== 'active') {
                          return (
                            <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3" />
                              {t('productInactive')}
                            </p>
                          )
                        }
                        if (productInfo.stock !== null && productInfo.stock !== undefined) {
                          const remainingStock = productInfo.stock - item.quantity
                          if (remainingStock < 0) {
                            return (
                              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                <AlertCircle className="h-3 w-3" />
                                {t('insufficientStock', { available: productInfo.stock })}
                              </p>
                            )
                          }
                          if (remainingStock < 5) {
                            return (
                              <p className="text-xs text-orange-500 mt-1">
                                {t('lowStock', { stock: productInfo.stock })}
                              </p>
                            )
                          }
                          return (
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('inStock', { stock: productInfo.stock })}
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
          )}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{t('selectedTotal')}</span>
              <span className="text-xl font-bold">{selectedTotalDisplay}</span>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={handleCheckout}
              disabled={
                selectedItems.length === 0 ||
                loadingStocks ||
                loadingMultiLang ||
                isValidating ||
                invalidItems.length > 0
              }
            >
              {loadingStocks || loadingMultiLang
                ? tCommon('loading')
                : isValidating
                  ? t('validating')
                  : invalidItems.length > 0
                    ? t('pleaseFixInvalidItems')
                    : selectedItems.length === 0
                      ? t('pleaseSelectItems')
                      : t('checkoutSelected', { count: selectedItems.length })}
            </Button>
          </Card>
        </>
      )}

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clearCart')}</DialogTitle>
            <DialogDescription>{t('confirmClearCart')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearCart()
                setShowClearDialog(false)
              }}
            >
              {tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
