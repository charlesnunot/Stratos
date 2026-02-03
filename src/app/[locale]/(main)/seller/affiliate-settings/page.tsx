'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Save, CheckSquare, Square } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

interface Product {
  id: string
  name: string
  images: string[] | null
  price: number
  currency?: string
  allow_affiliate: boolean
  commission_rate: number | null
}

export default function AffiliateSettingsPage() {
  const { user, loading: authLoading } = useAuthGuard()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')

  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [editingProducts, setEditingProducts] = useState<Record<string, { allow_affiliate: boolean; commission_rate: string }>>({})

  // Query all seller products
  const { data: products, isLoading } = useQuery({
    queryKey: ['sellerProducts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('products')
        .select('id, name, images, price, allow_affiliate, commission_rate')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as Product[]
    },
    enabled: !!user,
  })

  // Update single product mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ productId, allow_affiliate, commission_rate }: { productId: string; allow_affiliate: boolean; commission_rate: number | null }) => {
      const { error } = await supabase
        .from('products')
        .update({
          allow_affiliate,
          commission_rate: allow_affiliate ? commission_rate : null,
        })
        .eq('id', productId)
        .eq('seller_id', user!.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellerProducts', user?.id] })
      toast({
        title: tCommon('success'),
        description: t('affiliateSettingsUpdated') || '带货设置已更新',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    },
  })

  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async ({ productIds, allow_affiliate, commission_rate }: { productIds: string[]; allow_affiliate: boolean; commission_rate: number | null }) => {
      const updates = productIds.map(id => ({
        id,
        allow_affiliate,
        commission_rate: allow_affiliate ? commission_rate : null,
      }))

      for (const update of updates) {
        const { error } = await supabase
          .from('products')
          .update({
            allow_affiliate: update.allow_affiliate,
            commission_rate: update.commission_rate,
          })
          .eq('id', update.id)
          .eq('seller_id', user!.id)

        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellerProducts', user?.id] })
      setSelectedProducts(new Set())
      toast({
        title: tCommon('success'),
        description: t('batchUpdateSuccess') || '批量更新成功',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    },
  })

  // Calculate statistics
  const stats = products ? {
    totalProducts: products.length,
    affiliateEnabled: products.filter(p => p.allow_affiliate).length,
    averageCommissionRate: products
      .filter(p => p.allow_affiliate && p.commission_rate)
      .reduce((sum, p) => sum + (p.commission_rate || 0), 0) / 
      (products.filter(p => p.allow_affiliate && p.commission_rate).length || 1),
  } : null

  const handleProductToggle = (productId: string, checked: boolean) => {
    const product = products?.find(p => p.id === productId)
    if (!product) return

    setEditingProducts(prev => ({
      ...prev,
      [productId]: {
        allow_affiliate: checked,
        commission_rate: checked ? (product.commission_rate?.toString() || '10') : '0',
      },
    }))
  }

  const handleCommissionRateChange = (productId: string, value: string) => {
    setEditingProducts(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        commission_rate: value,
      },
    }))
  }

  const handleSaveProduct = async (productId: string) => {
    const editData = editingProducts[productId]
    if (!editData) return

    const commissionRate = parseFloat(editData.commission_rate)
    if (editData.allow_affiliate && (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100)) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('invalidCommissionRate') || '佣金率必须在0-100之间',
      })
      return
    }

    updateProductMutation.mutate({
      productId,
      allow_affiliate: editData.allow_affiliate,
      commission_rate: editData.allow_affiliate ? commissionRate : null,
    })

    // Remove from editing state after save
    setEditingProducts(prev => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedProducts.size === products?.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(products?.map(p => p.id) || []))
    }
  }

  const handleBatchToggle = (allow_affiliate: boolean) => {
    if (selectedProducts.size === 0) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('selectProductsFirst') || '请先选择商品',
      })
      return
    }

    if (!confirm(t('confirmBatchUpdate') || '确认批量更新选中的商品？')) {
      return
    }

    batchUpdateMutation.mutate({
      productIds: Array.from(selectedProducts),
      allow_affiliate,
      commission_rate: null,
    })
  }

  const handleBatchSetCommission = () => {
    if (selectedProducts.size === 0) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('selectProductsFirst') || '请先选择商品',
      })
      return
    }

    const rateStr = prompt(t('enterCommissionRate') || '请输入佣金率 (0-100):')
    if (!rateStr) return

    const rate = parseFloat(rateStr)
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('invalidCommissionRate') || '佣金率必须在0-100之间',
      })
      return
    }

    if (!confirm(t('confirmBatchUpdate') || '确认批量更新选中的商品？')) {
      return
    }

    batchUpdateMutation.mutate({
      productIds: Array.from(selectedProducts),
      allow_affiliate: true,
      commission_rate: rate,
    })
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('affiliateSettingsTitle') || '商品带货设置'}</h1>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">{t('totalProducts') || '总商品数'}</p>
            <p className="text-2xl font-bold">{stats.totalProducts}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">{t('affiliateEnabled') || '已开启带货'}</p>
            <p className="text-2xl font-bold">{stats.affiliateEnabled}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">{t('averageCommissionRate') || '平均佣金率'}</p>
            <p className="text-2xl font-bold">
              {stats.averageCommissionRate.toFixed(1)}%
            </p>
          </Card>
        </div>
      )}

      {/* Batch Actions */}
      {products && products.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="outline"
              onClick={handleSelectAll}
              size="sm"
            >
              {selectedProducts.size === products.length ? (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {t('deselectAll') || '取消全选'}
                </>
              ) : (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  {t('selectAll') || '全选'}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleBatchToggle(true)}
              size="sm"
              disabled={selectedProducts.size === 0 || batchUpdateMutation.isPending}
            >
              {t('batchEnable') || '批量开启带货'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleBatchToggle(false)}
              size="sm"
              disabled={selectedProducts.size === 0 || batchUpdateMutation.isPending}
            >
              {t('batchDisable') || '批量关闭带货'}
            </Button>
            <Button
              variant="outline"
              onClick={handleBatchSetCommission}
              size="sm"
              disabled={selectedProducts.size === 0 || batchUpdateMutation.isPending}
            >
              {t('batchSetCommission') || '批量设置佣金率'}
            </Button>
            {selectedProducts.size > 0 && (
              <span className="text-sm text-muted-foreground">
                {t('selectedCount') || '已选择'}: {selectedProducts.size}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Products List */}
      {!products || products.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="mb-4 text-muted-foreground">{tCommon('noData')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const isEditing = editingProducts[product.id] !== undefined
            const editData = editingProducts[product.id] || {
              allow_affiliate: product.allow_affiliate,
              commission_rate: product.commission_rate?.toString() || '0',
            }
            const isSelected = selectedProducts.has(product.id)

            return (
              <Card key={product.id} className="p-4">
                <div className="mb-3 flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedProducts(prev => new Set([...prev, product.id]))
                      } else {
                        setSelectedProducts(prev => {
                          const next = new Set(prev)
                          next.delete(product.id)
                          return next
                        })
                      }
                    }}
                  />
                  {product.images?.[0] && (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-20 w-20 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">{formatCurrency(product.price, (product.currency as Currency) || 'USD')}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`affiliate-${product.id}`}
                      checked={editData.allow_affiliate}
                      onCheckedChange={(checked) => handleProductToggle(product.id, checked as boolean)}
                    />
                    <Label htmlFor={`affiliate-${product.id}`} className="cursor-pointer">
                      {t('allowAffiliate')}
                    </Label>
                  </div>

                  {editData.allow_affiliate && (
                    <div>
                      <Label className="text-sm">{t('commissionRate')} (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={editData.commission_rate}
                        onChange={(e) => handleCommissionRateChange(product.id, e.target.value)}
                        className="mt-1"
                        placeholder="10"
                      />
                    </div>
                  )}

                  {isEditing && (
                    <Button
                      size="sm"
                      onClick={() => handleSaveProduct(product.id)}
                      disabled={updateProductMutation.isPending}
                      className="w-full"
                    >
                      {updateProductMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {tCommon('saving')}
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          {tCommon('save')}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
