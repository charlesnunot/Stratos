'use client'

import { useState, useMemo, useEffect } from 'react'
import { useUserPosts } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { useUserPage } from '@/lib/hooks/useUserPage'
import { FollowButton } from '@/components/social/FollowButton'
import { PostCard } from '@/components/social/PostCard'
import { ChatButton } from '@/components/social/ChatButton'
import { UserTipButton } from '@/components/social/UserTipButton'
import { ProfileMoreMenu } from '@/components/social/ProfileMoreMenu'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { Loader2, Plus, Pencil, Star, Tag, TrendingUp, Gift, Shield, ShoppingCart, Package, BookOpen, EyeOff, Users, History, BarChart3 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { useFavorites } from '@/lib/hooks/useFavorites'
import { FavoriteItem } from '@/components/favorites/FavoriteItem'
import { useCartStore } from '@/store/cartStore'
import { useUserProducts } from '@/lib/hooks/useProducts'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'
import { useTrackView } from '@/lib/hooks/useTrackView'

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { user } = useAuth()

  // PV/UV 统计（含匿名）：个人主页访客量（在 useUserPage 之前调用，仅依赖 userId）
  useTrackView(userId ? 'profile' : null, userId || null)

  // 如果访问自己的页面但 URL 参数无效，重定向到自己的页面
  useEffect(() => {
    if (user && (!userId || userId.trim() === '')) {
      router.replace(`/profile/${user.id}`)
    }
  }, [user, userId, router])

  // 页面级 orchestrator：身份 / 关系 / 能力 统一由 useUserPage 提供
  const userPage = useUserPage(userId)
  const profile = userPage.targetUser
  const profileErrorKind = userPage.profileErrorKind
  const isOwnProfile = userPage.relationship === 'self'

  const { data: postsData, isLoading: postsLoading } = useUserPosts(userId, isOwnProfile ? undefined : 'approved')
  const supabase = createClient()
  const t = useTranslations('profile')
  const tPosts = useTranslations('posts')
  const tCommon = useTranslations('common')
  const tMessages = useTranslations('messages')
  const tFavorites = useTranslations('favorites')
  const tCart = useTranslations('cart')
  const tOrders = useTranslations('orders')
  const locale = useLocale()
  const [activeTab, setActiveTab] = useState<'posts' | 'products' | 'series' | 'favorites' | 'drafts'>('posts')

  // Get user posts from paginated data
  // ✅ 修复 P0-2: 如果是自己的页面，postsData 包含所有状态的帖子（包括草稿）
  const userPosts = postsData?.pages.flatMap((page) => page) || []
  
  // ✅ 修复 P0-2: 分离已审核帖子和草稿帖子
  const approvedPosts = isOwnProfile 
    ? userPosts.filter((post: any) => post.status === 'approved')
    : userPosts
  const draftPosts = isOwnProfile 
    ? userPosts.filter((post: any) => post.status === 'draft' || post.status === 'pending')
    : []

  const { data: productsData, isLoading: productsLoading } = useUserProducts(userId)
  const userProducts = productsData?.pages.flatMap((page) => page) || []

  const { data: productsCount = 0 } = useQuery({
    queryKey: ['userProductsCount', userId],
    queryFn: async () => {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'active')
      return count || 0
    },
    enabled: !!userId,
  })

  // ✅ 新增：处理连载帖子 - 按 series_id 分组（只处理已审核的帖子）
  const seriesPosts = useMemo(() => {
    const seriesMap = new Map<string, typeof approvedPosts>()
    const normalPosts: typeof approvedPosts = []

    approvedPosts.forEach((post: any) => {
      if (post.post_type === 'series' && post.series_id) {
        if (!seriesMap.has(post.series_id)) {
          seriesMap.set(post.series_id, [])
        }
        seriesMap.get(post.series_id)!.push(post)
      } else {
        normalPosts.push(post)
      }
    })

    // 对每个连载按 series_order 排序
    seriesMap.forEach((posts, seriesId) => {
      posts.sort((a: any, b: any) => (a.series_order || 0) - (b.series_order || 0))
    })

    return { seriesMap, normalPosts }
  }, [approvedPosts])

  const seriesCount = seriesPosts.seriesMap.size

  const { data: postsCount = 0 } = useQuery({
    queryKey: ['userPostsCount', userId],
    queryFn: async () => {
      const { count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'approved')
      return count || 0
    },
    enabled: !!userId,
  })

  const { data: draftCount = 0 } = useQuery({
    queryKey: ['userDraftCount', userId],
    queryFn: async () => {
      const { count } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['draft', 'pending'])
      return count || 0
    },
    enabled: !!userId && isOwnProfile,
  })

  const { data: totalLikes = 0 } = useQuery({
    queryKey: ['userTotalLikes', userId],
    queryFn: async () => {
      const { data: posts } = await supabase
        .from('posts')
        .select('like_count')
        .eq('user_id', userId)
        .eq('status', 'approved')
      
      if (!posts) return 0
      return posts.reduce((sum, post) => sum + (post.like_count || 0), 0)
    },
    enabled: !!userId,
  })

  // Get favorites count and data (only for own profile)
  const { data: favorites, isLoading: favoritesLoading } = useFavorites(undefined)
  const favoritesCount = favorites?.length || 0

  // 获取购物车商品数量
  const cartItems = useCartStore((state) => state.items)
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  // Format numbers with thousand separators (use current locale)
  const formatNumber = (num: number): string => {
    const l = locale === 'zh' ? 'zh-CN' : locale
    return new Intl.NumberFormat(l).format(num)
  }

  const isAdmin = isOwnProfile && (profile?.role === 'admin' || profile?.role === 'support')

  // 页面级状态机：loading / unavailable / ready
  if (userPage.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (userPage.status === 'unavailable') {
    if (userPage.unavailableReason === 'suspended' && profile) {
      return (
        <div className="py-12 text-center">
          <Card className="p-8 max-w-md mx-auto">
            <EyeOff className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">
              {profile.status === 'banned' ? t('userBanned') || '该用户已被封禁' : t('userSuspended') || '该用户已被暂停'}
            </h2>
            <p className="text-muted-foreground">
              {profile.status === 'banned'
                ? t('userBannedMessage') || '此用户已被永久封禁，无法查看其内容。'
                : t('userSuspendedMessage') || '此用户已被暂时暂停，无法查看其内容。'}
            </p>
          </Card>
        </div>
      )
    }
    if (userPage.unavailableReason === 'permission') {
      return (
        <div className="py-12 text-center">
          <Card className="p-8 max-w-md mx-auto">
            <EyeOff className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">{t('blockedViewTitle') || '您已被限制访问'}</h2>
            <p className="text-muted-foreground">
              {t('blockedViewMessage') || '您无法查看该用户的主页内容。'}
            </p>
          </Card>
        </div>
      )
    }
    if (userPage.unavailableReason === 'network') {
      return (
        <div className="py-12 text-center">
          <p className="text-destructive">{t('loadFailed')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('unknownError')}</p>
        </div>
      )
    }
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('userNotFound')}</p>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-2 sm:px-4 py-6">
      {/* 数据降级提示：仅在 schema_mismatch / permission_limited 时显示，避免页面直接崩溃 */}
      {(profileErrorKind === 'schema_mismatch' || profileErrorKind === 'permission_limited') && (
        <Card className="mb-4 border-dashed border-yellow-400 bg-yellow-50">
          <div className="p-4 text-sm text-muted-foreground">
            部分资料暂时无法完整加载，但基础头像和昵称仍可浏览。
          </div>
        </Card>
      )}

      {/* Profile Header - Pinterest Style */}
      <Card className="p-6 md:p-8 relative">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">
          {/* Left: Name, Stats, Bio */}
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1">
                {profile.display_name || t('unnamedUser')}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">@{profile.username}</p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 md:gap-6 text-base">
              <Link 
                href={`/profile/${userId}/followers`} 
                className="hover:underline"
              >
                <span className="font-semibold text-lg">{formatNumber(profile.follower_count)}</span>
                <span className="text-muted-foreground ml-1"> {t('followers')}</span>
              </Link>
              <Link 
                href={`/profile/${userId}/following`} 
                className="hover:underline"
              >
                <span className="font-semibold text-lg">{formatNumber(profile.following_count)}</span>
                <span className="text-muted-foreground ml-1"> {t('following')}</span>
              </Link>
              {/* ✅ 新增：获赞统计 */}
              <div className="hover:underline cursor-default">
                <span className="font-semibold text-lg">{formatNumber(totalLikes)}</span>
                <span className="text-muted-foreground ml-1">{t('totalLikes')}</span>
              </div>
            </div>

            {/* Feature Entrances - Only shown on own profile */}
            {isOwnProfile && (
              <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
                {isAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                  >
                    <Shield className="h-4 w-4" />
                    <span>{t('adminPanel')}</span>
                  </Link>
                )}
                <Link
                  href="/seller/dashboard"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <Tag className="h-4 w-4" />
                  <span>{t('sellerCenter')}</span>
                </Link>
                <Link
                  href="/affiliate/products"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <TrendingUp className="h-4 w-4" />
                  <span>{t('affiliateCenter')}</span>
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <Gift className="h-4 w-4" />
                  <span>{t('tips')}</span>
                </Link>
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm relative"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>{tCart('pageTitle')}</span>
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                      {cartItemCount > 9 ? '9+' : cartItemCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <Package className="h-4 w-4" />
                  <span>{tOrders('myOrders')}</span>
                </Link>
                <Link
                  href={`/profile/${userId}/people`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <Users className="h-4 w-4" />
                  <span>{t('peopleEntrance')}</span>
                </Link>
                <Link
                  href={`/profile/${userId}/history`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <History className="h-4 w-4" />
                  <span>{t('historyEntrance')}</span>
                </Link>
                <Link
                  href="/insights"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>{t('insightsEntrance')}</span>
                </Link>
              </div>
            )}

            {/* Bio */}
            {profile.bio && (
              <div className="text-sm leading-relaxed text-foreground max-w-2xl">
                {profile.bio}
              </div>
            )}

            {/* Location */}
            {profile.location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                📍 {profile.location}
              </p>
            )}
          </div>

          {/* Right: Large Avatar */}
          <div className="flex-shrink-0 order-first md:order-last">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || t('userFallback')}
                className="h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36 rounded-full object-cover border-2 border-background shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36 items-center justify-center rounded-full bg-muted border-2 border-background shadow-md">
                <span className="text-3xl sm:text-4xl md:text-5xl font-semibold">
                  {profile.display_name?.[0] || t('userInitial')}
                </span>
              </div>
            )}
          </div>

          {/* Edit Button / Follow Button：由 capabilities 控制显隐 */}
          {userPage.capabilities.canEditProfile ? (
            <div className="md:absolute md:top-6 md:right-6 w-full md:w-auto">
              <Button
                onClick={() => router.push(`/profile/${userId}/edit`)}
                variant="outline"
                className="w-full md:w-auto"
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t('editProfile')}
              </Button>
            </div>
          ) : (
            <div className="md:absolute md:top-6 md:right-6 w-full md:w-auto flex flex-col sm:flex-row gap-2">
              {userPage.capabilities.canFollow && (
                <FollowButton userId={userId} />
              )}
              {userPage.capabilities.canTip && (
                <UserTipButton
                  targetUserId={userId}
                  targetUserName={profile.display_name ?? profile.username ?? undefined}
                />
              )}
              {userPage.capabilities.canChat && (
                <ChatButton
                  targetUserId={userId}
                  targetUserName={profile.display_name ?? profile.username ?? undefined}
                  variant="outline"
                  size="sm"
                  className="w-full md:w-auto"
                >
                  {tMessages('chatWithAuthor')}
                </ChatButton>
              )}
              {userPage.capabilities.canBlock && (
                <ProfileMoreMenu
                  targetUserId={userId}
                  targetUserName={profile.display_name ?? profile.username ?? undefined}
                  targetUserAvatar={profile.avatar_url}
                />
              )}
            </div>
          )}
        </div>
      </Card>

      {!isOwnProfile && (
        <SuggestedUsers profileUserId={userId} limit={6} />
      )}

      {/* Tabs Navigation */}
      <div className="border-b">
        <div className="flex gap-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('posts')}
            className={`pb-3 px-1 text-base font-medium transition-colors border-b-2 min-w-fit ${
              activeTab === 'posts'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('posts')} ({formatNumber(postsCount)})
          </button>
          {/* ✅ 修复 P2: 商品 Tab - 检查卖家状态 */}
          {productsCount > 0 && profile?.status !== 'banned' && profile?.status !== 'suspended' && (
            <button
              onClick={() => setActiveTab('products')}
              className={`pb-3 px-1 text-base font-medium transition-colors border-b-2 min-w-fit ${
                activeTab === 'products'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Tag className="inline-block h-4 w-4 mr-1" />
              {t('products')} ({formatNumber(productsCount)})
            </button>
          )}
          {/* ✅ 新增：连载 Tab */}
          {seriesCount > 0 && (
            <button
              onClick={() => setActiveTab('series')}
              className={`pb-3 px-1 text-base font-medium transition-colors border-b-2 min-w-fit ${
                activeTab === 'series'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="inline-block h-4 w-4 mr-1" />
              {t('series')} ({formatNumber(seriesCount)})
            </button>
          )}
          {/* ✅ 修复 P0-2: 草稿 Tab - 只对自己的页面显示 */}
          {isOwnProfile && draftCount > 0 && (
            <button
              onClick={() => setActiveTab('drafts')}
              className={`pb-3 px-1 text-base font-medium transition-colors border-b-2 min-w-fit ${
                activeTab === 'drafts'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Pencil className="inline-block h-4 w-4 mr-1" />
              {t('drafts') || '草稿'} ({formatNumber(draftCount)})
            </button>
          )}
          {/* Favorites tab - only show on own profile */}
          {isOwnProfile && (
            <button
              onClick={() => setActiveTab('favorites')}
              className={`pb-3 px-1 text-base font-medium transition-colors border-b-2 min-w-fit ${
                activeTab === 'favorites'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Star className="inline-block h-4 w-4 mr-1" />
              {tFavorites('pageTitle')} ({formatNumber(favoritesCount)})
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="mt-6 -mx-2 sm:-mx-4 md:mx-0">
        {activeTab === 'posts' && (
          <>
            {!userPage.capabilities.canViewPosts ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">{t('restrictedViewMessage')}</p>
              </div>
            ) : postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : seriesPosts.normalPosts.length === 0 && seriesCount === 0 ? (
              <p className="py-12 text-center text-muted-foreground">{t('noPosts')}</p>
            ) : (
              <MasonryGrid>
                {/* Create Post Card - Only shown on own profile */}
                {isOwnProfile && (
                  <Card 
                    className="group overflow-hidden transition-shadow hover:shadow-lg cursor-pointer border-dashed border-2"
                    onClick={() => router.push('/post/create')}
                  >
                    <div className="p-6 sm:p-8 md:p-12 flex flex-col items-center justify-center min-h-[200px] text-center">
                      <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                        <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                      </div>
                      <p className="text-base sm:text-lg font-semibold text-foreground">
                        {tPosts('createPost')}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                        {t('createPostHint')}
                      </p>
                    </div>
                  </Card>
                )}
                {/* User Posts (只显示非连载帖子) */}
                {seriesPosts.normalPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </MasonryGrid>
            )}
          </>
        )}

        {/* ✅ 新增：商品 Tab */}
        {activeTab === 'products' && (
          <>
            {productsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : userProducts.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">{t('noProducts')}</p>
            ) : (
              <MasonryGrid>
                {userProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </MasonryGrid>
            )}
          </>
        )}

        {/* ✅ 新增：连载 Tab */}
        {activeTab === 'series' && (
          <>
            {postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : seriesCount === 0 ? (
              <p className="py-12 text-center text-muted-foreground">{t('noSeries')}</p>
            ) : (
              <div className="space-y-8">
                {Array.from(seriesPosts.seriesMap.entries()).map(([seriesId, posts]) => (
                  <Card key={seriesId} className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {t('seriesTitle')} ({posts.length} {t('seriesPosts')})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {posts.map((post: any, index: number) => (
                        <div key={post.id} className="flex items-start gap-4 pb-4 border-b last:border-b-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <PostCard post={post} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ✅ 修复 P0-2: 草稿 Tab 内容 - 只对自己的页面显示 */}
        {activeTab === 'drafts' && isOwnProfile && (
          <>
            {postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : draftPosts.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="mb-4 text-muted-foreground">{t('noDrafts') || '暂无草稿'}</p>
                <Button
                  onClick={() => router.push('/post/create')}
                  variant="outline"
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {tPosts('createPost')}
                </Button>
              </Card>
            ) : (
              <MasonryGrid>
                {draftPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </MasonryGrid>
            )}
          </>
        )}

        {activeTab === 'favorites' && isOwnProfile && (
          <>
            {favoritesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !favorites || favorites.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="mb-4 text-muted-foreground">{tFavorites('noFavorites')}</p>
                <p className="text-sm text-muted-foreground">
                  {tFavorites('discoverMessage')}
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {favorites.map((favorite) => (
                  <FavoriteItem key={favorite.id} favorite={favorite} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 举报对话框已移至 ProfileMoreMenu 中 */}
    </div>
  )
}
