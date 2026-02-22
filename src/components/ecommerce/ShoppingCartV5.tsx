// Cart CRDT System - Shopping Cart Component (v5)
// ============================================================
// Modern shopping cart component with CRDT synchronization
// ============================================================

'use client'

import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { X, Plus, Minus, AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showError, showWarning } from '@/lib/utils/toast'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { getLocalizedColorName } from '@/lib/constants/colors'
import { getLocalizedSizeName } from '@/lib/constants/sizes'
import { useCartV5, convertToLegacyFormat } from '@/lib/hooks/useCartV5'
import { parseSkuId } from '@/lib/cart'

interface ProductInfo {
  id: string
  stock: number | null
  status: string
  currency?: string
  name?: string
  name_translated?: string | null
  content_lang?: 'zh' | 'en' | null
  price?: number
}

interface SelectedState {
  selectedSkus: Set<string>
  setSelectedSkus: (skus: Set<string>) => void
}

// Custom hook for selection state management
function useSelectedState(): SelectedState {
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set())
  
  return {
    selectedSkus,
    setSelectedSkus
  }
}

export function ShoppingCartV5() {
  const router = useRouter()
  const t = useTranslations('cart')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
  
  // Use new cart hook
  const { 
    items: crdtItems, 
    isLoading, 
    isSyncing,
    addItem, 
    decreaseItem, 
    removeItem, 
    clearCart,
    getTotalQuantity,
    getItemQuantity
  } = useCartV5()
  
  // Selection state
  const { selectedSkus, setSelectedSkus } = useSelectedState()
  
  // Product info cache
  const [productInfos, setProductInfos] = useState<Map<string, ProductInfo>>(new Map())
  const [loadingStocks, setLoadingStocks] = useState(false)
  const supabase = createClient()
  
  // Convert CRDT items to legacy format for compatibility
  const legacyItems = useMemo(() => convertToLegacyFormat(crdtItems), [crdtItems])
  
  // Selection helpers
  const selectedCount = selectedSkus.size
  const allSelected = crdtItems.length > 0 && selectedCount === crdtItems.length
  const noneSelected = selectedCount === 0
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  
  // Default select all when items load
  useEffect(() => {
    if (crdtItems.length > 0 && selectedSkus.size === 0) {
      const allSkus = new Set(crdtItems.map(item => item.sku_id))
      setSelectedSkus(allSkus)
    }
  }, [crdtItems.length, selectedSkus.size, setSelectedSkus])
  
  // Update checkbox indeterminate state
  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = !allSelected && !noneSelected
  }, [allSelected, noneSelected])
  
  // Fetch product information
  useEffect(() => {
    if (crdtItems.length === 0) {
      setProductInfos(new Map())
      return
    }

    const fetchProductInfos = async () => {
      setLoadingStocks(true)
      try {
        // Extract unique product IDs from SKUs
        const productIds = Array.from(new Set(
          crdtItems.map(item => parseSkuId(item.sku_id).product_id)
        ))
        
        let query = supabase
          .from('products')
          .select('id, stock, status, currency, name, name_translated, content_lang, price')

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
            currency: product.currency,
            name: product.name,
            name_translated: product.name_translated,
            content_lang: product.content_lang,
            price: product.price
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
  }, [crdtItems, supabase])
  
  // Selection handlers
  const toggleSelect = (skuId: string) => {
    const newSelected = new Set(selectedSkus)
    if (newSelected.has(skuId)) {
      newSelected.delete(skuId)
    } else {
      newSelected.add(skuId)
    }
    setSelectedSkus(newSelected)
  }
  
  const selectAll = () => {
    const allSkus = new Set(crdtItems.map(item => item.sku_id))
    setSelectedSkus(allSkus)
  }
  
  const deselectAll = () => {
    setSelectedSkus(new Set())
  }
  
  // Quantity handlers
  const handleIncreaseQuantity = (skuId: string) => {
    const { product_id, color, size } = parseSkuId(skuId)
    const productInfo = productInfos.get(product_id)
    const currentQuantity = getItemQuantity(skuId)
    
    if (productInfo) {
      // Check if product is still available
      if (productInfo.status !== 'active') {
        showWarning(t('cannotIncreaseQuantity'))
        return
      }

      // Check stock limit
      if (productInfo.stock !== null && productInfo.stock !== undefined) {
        if (currentQuantity >= productInfo.stock) {
          showError(t('maxQuantityReached').replace('{stock}', String(productInfo.stock)))
          return
        }
      }
    }
    
    // Add item using new CRDT system
    addItem(product_id, 1, color, size)
  }

  const handleDecreaseQuantity = (skuId: string) => {
    const { product_id, color, size } = parseSkuId(skuId)
    const currentQuantity = getItemQuantity(skuId)
    
    if (currentQuantity <= 1) {
      // Remove item if quantity is 1
      removeItem(product_id, color, size)
    } else {
      // Decrease quantity
      decreaseItem(product_id, 1, color, size)
    }
  }

  const handleRemoveItem = (skuId: string) => {
    const { product_id, color, size } = parseSkuId(skuId)
    removeItem(product_id, color, size)
  }

  const handleCheckout = () => {
    if (selectedSkus.size > 0) {
      router.push('/checkout')
    }
  }

  // Calculate total price for selected items
  const getSelectedTotal = (): number => {
    let total = 0
    
    for (const skuId of selectedSkus) {
      const { product_id } = parseSkuId(skuId)
      const productInfo = productInfos.get(product_id)
      const quantity = getItemQuantity(skuId)
      
      if (productInfo?.price) {
        total += productInfo.price * quantity
      }
    }
    
    return total
  }

  const selectedTotal = getSelectedTotal()
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">{tCommon('loading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sync Status Indicator */}
      {isSyncing && (
        <div className="flex items-center justify-center p-2 bg-blue-50 text-blue-600 rounded">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">{t('syncing')}</span>
        </div>
      )}
      
      {crdtItems.length > 0 && (
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

      {crdtItems.length === 0 ? (
        <p className="text-center text-muted-foreground">{t('emptyCart')}</p>
      ) : (
        <>
          <div className="space-y-2">
            {crdtItems.map((item) => {
              const { product_id, color, size } = parseSkuId(item.sku_id)
              const productInfo = productInfos.get(product_id)
              const isSelected = selectedSkus.has(item.sku_id)
              
              return (
                <Card key={item.sku_id} className="p-3 md:p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                    <div className="pt-1 sm:pt-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(item.sku_id)}
                        aria-label={productInfo?.name || 'Product'}
                      />
                    </div>
                    
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 w-full">
                      {/* Product Image and Info */}
                      <div className="flex items-center gap-3">
                        <img
                          src={legacyItems.find(li => li.product_id === product_id)?.image || ''}
                          alt={productInfo?.name || 'Product'}
                          className="w-16 h-16 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">
                            {productInfo?.name_translated ? 
                              getDisplayContent(
                                locale,
                                productInfo.content_lang ?? null,
                                productInfo.name || '',
                                productInfo.name_translated
                              ) : 
                              productInfo?.name || 'Loading...'
                            }
                          </h3>
                          
                          {/* Variant Info */}
                          {(color || size) && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {color && (
                                <span>{getLocalizedColorName(color, locale)}</span>
                              )}
                              {color && size && ' • '}
                              {size && (
                                <span>{getLocalizedSizeName(size, locale)}</span>
                              )}
                            </div>
                          )}
                          
                          {/* Price */}
                          {productInfo?.price && (
                            <div className="text-lg font-semibold mt-1">
                              {formatPriceWithConversion(
                                productInfo.price,
                                (productInfo.currency || 'USD') as Currency,
                                userCurrency
                              ).main}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between sm:justify-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDecreaseQuantity(item.sku_id)}
                          disabled={isSyncing}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        
                        <span className="font-medium min-w-[2rem] text-center">
                          {item.effective_quantity}
                        </span>
                        
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleIncreaseQuantity(item.sku_id)}
                          disabled={isSyncing || (productInfo?.stock !== null && item.effective_quantity >= (productInfo?.stock || 0))}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Remove Button */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.sku_id)}
                          disabled={isSyncing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
          
          {/* Checkout Section */}
          <Card className="p-4 sticky bottom-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">
                  {formatPriceWithConversion(selectedTotal, 'USD', userCurrency).main}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('selectedItems', { count: selectedCount })}
                </div>
              </div>
              
              <Button 
                onClick={handleCheckout}
                disabled={selectedCount === 0 || isSyncing}
                className="min-w-[120px]"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t('checkout')}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}