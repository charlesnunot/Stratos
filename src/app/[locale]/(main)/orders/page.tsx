import { createClient } from '@/lib/supabase/server'
import { OrdersPageClient } from './OrdersPageClient'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

export default async function OrdersPage() {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const t = await getTranslations('orders')
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t('pleaseLoginToView')}</p>
      </div>
    )
  }

  // Fetch orders data on server
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      product:products(id, name, images),
      seller:profiles!orders_seller_id_fkey(display_name)
    `)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  const t = await getTranslations('orders')

  return (
    <OrdersPageClient
      initialOrders={orders || []}
      initialError={error}
      user={user}
      translations={{
        myOrders: t('myOrders'),
        noOrders: t('noOrders'),
        goShopping: t('goShopping'),
        orderNumber: t('orderNumber'),
        pending: t('pending'),
        paid: t('paid'),
        shipped: t('shipped'),
        completed: t('completed'),
        cancelled: t('cancelled'),
        product: t('product'),
        quantity: t('quantity'),
        seller: t('seller'),
        viewDetails: t('viewDetails'),
        payNow: t('payNow'),
      }}
    />
  )
}
