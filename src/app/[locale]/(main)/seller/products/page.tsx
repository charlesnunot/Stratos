'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/api/audit'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Edit, Trash2 } from 'lucide-react'
import { Link, useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

export default function SellerProductsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')

  // Handle redirect to login when not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['sellerProducts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const handleDelete = async (productId: string) => {
    if (!confirm(tCommon('confirm') + '?')) return

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('seller_id', user!.id)

    if (error) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: tCommon('error') + ': ' + error.message,
      })
    } else {
      logAudit({
        action: 'delete_product',
        userId: user!.id,
        resourceId: productId,
        resourceType: 'product',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
      refetch()
    }
  }

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show nothing if not authenticated (redirect is handled in useEffect)
  if (!user) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('myProducts')}</h1>
        <Link href="/seller/products/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('createProduct')}
          </Button>
        </Link>
      </div>

      {!products || products.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="mb-4 text-muted-foreground">{tCommon('noData')}</p>
          <Link href="/seller/products/create">
            <Button>{t('createProduct')}</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product: any) => (
            <Card key={product.id} className="p-4">
              {product.images?.[0] && (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="mb-3 h-48 w-full rounded object-cover"
                />
              )}
              <h3 className="mb-2 font-semibold">{product.name}</h3>
              <p className="mb-2 text-sm text-muted-foreground line-clamp-2">
                {product.description}
              </p>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-lg font-bold">{formatCurrency(product.price, (product.currency as Currency) || 'USD')}</span>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    product.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : product.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {product.status === 'active'
                    ? tCommon('active')
                    : product.status === 'pending'
                    ? tCommon('pending')
                    : tCommon('inactive')}
                </span>
              </div>
              <div className="flex gap-2">
                <Link href={`/seller/products/${product.id}/edit`} className="flex-1">
                  <Button variant="outline" className="w-full" size="sm">
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon('edit')}
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(product.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
