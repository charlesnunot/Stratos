import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { POST_SELECT, mapRowToPost, POSTS_PER_PAGE } from '@/lib/posts/shared'
import type { Post } from '@/lib/posts/shared'
import { HomePageClient } from './HomePageClient'

export const dynamic = 'force-dynamic'

type PageProps = { params?: Promise<{ locale?: string }> }

export default async function HomePage(props: PageProps) {
  const params = await (props.params ?? Promise.resolve({})) as { locale?: string }
  const locale = params.locale ?? 'en'

  const supabase = await createClient()
  let initialPosts: Post[] = []
  let initialError: unknown = null

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range(0, POSTS_PER_PAGE - 1)

  if (error) {
    initialError = error
  } else if (data?.length) {
    initialPosts = data.map(mapRowToPost)
  }

  let subscriptionType: string | null = null
  let tipEnabled = false
  let sellerEnabled = false
  let affiliateEnabled = false
  let affiliateProducts: { id: string; name: string; images: string[]; price: number; currency?: string; seller?: { username: string; display_name: string } }[] = []
  let sellerProducts: { id: string; name: string; images: string[]; price: number; currency?: string; seller?: { username: string; display_name: string } }[] = []

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_type, role')
      .eq('id', user.id)
      .single()
    subscriptionType = profile?.subscription_type ?? null
    sellerEnabled = profile?.role === 'seller'
    affiliateEnabled = profile?.role === 'affiliate' || profile?.role === 'seller'
    tipEnabled = true
    if (sellerEnabled) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, images, price, currency, seller_id')
        .eq('seller_id', user.id)
        .eq('status', 'active')
        .limit(5)
      if (products?.length) {
        const sellerIds = [...new Set(products.map((p: any) => p.seller_id))]
        const { data: profiles } = await supabase.from('profiles').select('id, username, display_name').in('id', sellerIds)
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
        sellerProducts = products.map((p: any) => ({
          id: p.id,
          name: p.name,
          images: p.images || [],
          price: p.price,
          currency: p.currency,
          seller: (() => { const pr = profileMap.get(p.seller_id); return pr ? { username: pr.username ?? '', display_name: pr.display_name ?? '' } : undefined })(),
        }))
      }
    }
    if (affiliateEnabled) {
      const { data: affProducts } = await supabase.from('products').select('id, name, images, price, currency, seller_id').eq('status', 'active').limit(10)
      if (affProducts?.length) {
        const sellerIds = [...new Set(affProducts.map((p: any) => p.seller_id))]
        const { data: profiles } = await supabase.from('profiles').select('id, username, display_name').in('id', sellerIds)
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
        affiliateProducts = affProducts.map((p: any) => ({
          id: p.id,
          name: p.name,
          images: p.images || [],
          price: p.price,
          currency: p.currency,
          seller: (() => { const pr = profileMap.get(p.seller_id); return pr ? { username: pr.username ?? '', display_name: pr.display_name ?? '' } : undefined })(),
        }))
      }
    }
  }

  const tPosts = await getTranslations({ locale, namespace: 'posts' })
  const tCommon = await getTranslations({ locale, namespace: 'common' })

  const translations = {
    discover: tPosts('discover'),
    loadFailed: tPosts('loadFailed'),
    guestLoadFailed: tPosts('guestLoadFailed'),
    guestLoadFailedMessage: tPosts('guestLoadFailedMessage'),
    noContentMessage: tPosts('noContentMessage'),
    guestEmptyMessage: tPosts('guestEmptyMessage'),
    registerToSeeMore: tPosts('registerToSeeMore'),
    loadingMore: tPosts('loadingMore'),
    loading: tCommon('loading'),
    retry: tCommon('retry'),
  }

  return (
    <HomePageClient
      initialPosts={initialPosts}
      initialError={initialError}
      user={user ? { id: user.id } : null}
      subscriptionType={subscriptionType}
      tipEnabled={tipEnabled}
      sellerEnabled={sellerEnabled}
      affiliateEnabled={affiliateEnabled}
      affiliateProducts={affiliateProducts}
      sellerProducts={sellerProducts}
      translations={translations}
    />
  )
}
