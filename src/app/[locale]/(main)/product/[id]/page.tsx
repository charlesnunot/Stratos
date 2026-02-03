import { createClient } from '@/lib/supabase/server'
import { ProductPageClient } from './ProductPageClient'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ProductPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  const supabase = await createClient()
  const productId = params.id

  // Fetch product data on server
  const { data: product, error } = await supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey(username, display_name)
        `)
        .eq('id', productId)
        .eq('status', 'active')
        .single()
      
  if (error || !product) {
    notFound()
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Parse FAQ JSONB field
  let parsedFaq = null
  if (product.faq) {
    try {
      parsedFaq = typeof product.faq === 'string' ? JSON.parse(product.faq) : product.faq
    } catch (e) {
      parsedFaq = []
    }
  }

  // Ensure all count fields have default values
  const productData = {
    ...product,
    faq: parsedFaq,
    like_count: product.like_count || 0,
    want_count: product.want_count || 0,
    share_count: product.share_count || 0,
    repost_count: product.repost_count || 0,
    favorite_count: product.favorite_count || 0,
    sales_count: product.sales_count || 0,
    currency: product.currency || 'USD',
  }

  const t = await getTranslations('products')
  const tCommon = await getTranslations('common')
  const tPosts = await getTranslations('posts')
  const tMessages = await getTranslations('messages')

  return (
    <ProductPageClient
      product={productData}
      user={user}
      translations={{
        loadFailed: t('loadFailed'),
        description: t('description'),
        stock: t('stock'),
        seller: t('seller'),
        report: t('report'),
        addedToCart: t('addedToCart'),
        addToCart: t('addToCart'),
        buyNow: t('buyNow'),
        redirectingCheckout: t('redirectingCheckout'),
        noImage: tCommon('noImage'),
        removeFromFavorites: tPosts('removeFromFavorites'),
        addToFavorites: tPosts('addToFavorites'),
        chatWithSeller: tMessages('chatWithSeller'),
      }}
    />
  )
}
