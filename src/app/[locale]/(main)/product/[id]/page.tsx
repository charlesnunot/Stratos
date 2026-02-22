import { createClient } from '@/lib/supabase/server'
import { ProductPageClient } from './ProductPageClient'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Product } from '@/lib/types/api'

export default async function ProductPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  const { locale } = params
  const supabase = await createClient()
  const productId = params.id

  // Fetch product data on server
  const { data: product, error } = await supabase
        .from('products')
        .select(`
          id, name, description, details, category, price, currency, stock, 
          images, status, seller_id, condition, shipping_fee, sales_countries,
          color_options, sizes, faq, allow_affiliate, commission_rate,
          content_lang, 
          name_translated, description_translated, details_translated, 
          category_translated, faq_translated,
          like_count, want_count, share_count, repost_count, favorite_count,
          created_at, updated_at,
          seller:profiles!products_seller_id_fkey(id, username, display_name)
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
    // Handle seller array from Supabase foreign key query
    seller: Array.isArray(product.seller) 
      ? (product.seller.length > 0 ? product.seller[0] : undefined) 
      : product.seller,
  } as Product

  const t = await getTranslations({ locale, namespace: 'products' })
  const tCommon = await getTranslations({ locale, namespace: 'common' })
  const tPosts = await getTranslations({ locale, namespace: 'posts' })
  const tMessages = await getTranslations({ locale, namespace: 'messages' })

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
        noImage: tCommon('noImage'),
        removeFromFavorites: tPosts('removeFromFavorites'),
        addToFavorites: tPosts('addToFavorites'),
        chatWithSeller: tMessages('chatWithSeller'),
        selectSize: tCommon('selectSize'),
        viewProduct: t('viewProduct'),
        colorOptions: t('colorOptions'),
        noImageColor: t('noImageColor'),
        salesCountries: t('salesCountries'),
        salesCountriesTo: t('salesCountriesTo'),
        salesCountriesGlobal: t('salesCountriesGlobal'),
        productInactive: t('productInactive'),
        productOutOfStock: t('productOutOfStock'),
        pleaseSelectColor: t('pleaseSelectColor'),
        pleaseSelectSize: t('pleaseSelectSize'),
        productNotFound: t('productNotFound'),
        validationFailed: t('validationFailed'),
        priceUpdated: t('priceUpdated'),
        addedToCartSuccess: t('addedToCartSuccess'),
        validationError: t('validationError'),
        cannotBuyInactive: t('cannotBuyInactive'),
        cannotBuyOutOfStock: t('cannotBuyOutOfStock'),
        cannotBuyOwnProduct: t('cannotBuyOwnProduct'),
        loginToReport: t('loginToReport'),
        loginToFavorite: t('loginToFavorite'),
        loginToRepost: t('loginToRepost'),
        operationFailed: t('operationFailed'),
        repostSuccess: t('repostSuccess'),
        repostSuccessWithExists: t('repostSuccessWithExists'),
        repostAlreadyExists: t('repostAlreadyExists'),
        repostFailed: t('repostFailed'),
        toastInfo: tCommon('toastInfo'),
        toastSuccess: tCommon('toastSuccess'),
        toastError: tCommon('toastError'),
        toastWarning: tCommon('toastWarning'),
      }}
    />
  )
}
