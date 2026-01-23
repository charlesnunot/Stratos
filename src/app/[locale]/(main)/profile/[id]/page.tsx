'use client'

import { useState } from 'react'
import { useProfile } from '@/lib/hooks/useProfile'
import { usePosts } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { FollowButton } from '@/components/social/FollowButton'
import { PostCard } from '@/components/social/PostCard'
import { ReportDialog } from '@/components/social/ReportDialog'
import { ChatButton } from '@/components/social/ChatButton'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { Loader2, Plus, Pencil, Flag, Star, Tag, TrendingUp, Coins, Shield, ShoppingCart, Package } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { showInfo } from '@/lib/utils/toast'
import { useFavorites } from '@/lib/hooks/useFavorites'
import { FavoriteItem } from '@/components/favorites/FavoriteItem'

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile(userId)
  const { data: postsData, isLoading: postsLoading } = usePosts('approved')
  const supabase = createClient()
  const t = useTranslations('profile')
  const tPosts = useTranslations('posts')
  const tCommon = useTranslations('common')
  const tMessages = useTranslations('messages')
  const tFavorites = useTranslations('favorites')
  const tCart = useTranslations('cart')
  const tOrders = useTranslations('orders')
  const [activeTab, setActiveTab] = useState<'posts' | 'favorites'>('posts')
  const [showReportDialog, setShowReportDialog] = useState(false)

  // Filter posts by user
  const userPosts = postsData?.pages
    .flatMap((page) => page)
    .filter((post) => post.user_id === userId) || []

  // Get posts count for tab display
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

  // Get favorites count and data (only for own profile)
  const { data: favorites, isLoading: favoritesLoading } = useFavorites(undefined)
  const favoritesCount = favorites?.length || 0

  // Format numbers with thousand separators
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('zh-CN').format(num)
  }

  const isOwnProfile = user?.id === userId
  const isAdmin = isOwnProfile && (profile?.role === 'admin' || profile?.role === 'support')

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (profileError) {
    console.error('Profile error:', profileError)
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {profileError instanceof Error ? profileError.message : t('unknownError')}
        </p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('userNotFound')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('userId')}: {userId}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-2 sm:px-4 py-6">
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
                  <Coins className="h-4 w-4" />
                  <span>{t('tips')}</span>
                </Link>
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>{tCart('pageTitle')}</span>
                </Link>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                >
                  <Package className="h-4 w-4" />
                  <span>{tOrders('myOrders')}</span>
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
                alt={profile.display_name || 'User'}
                className="h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36 rounded-full object-cover border-2 border-background shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36 items-center justify-center rounded-full bg-muted border-2 border-background shadow-md">
                <span className="text-3xl sm:text-4xl md:text-5xl font-semibold">
                  {profile.display_name?.[0] || 'U'}
                </span>
              </div>
            )}
          </div>

          {/* Edit Button / Follow Button */}
          {isOwnProfile ? (
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
              <FollowButton userId={userId} />
              <ChatButton
                targetUserId={userId}
                targetUserName={profile.display_name ?? profile.username ?? undefined}
                variant="outline"
                size="sm"
                className="w-full md:w-auto"
              >
                {tMessages('chatWithAuthor')}
              </ChatButton>
              <Button
                onClick={() => {
                  if (!user) {
                    showInfo('请先登录后再举报')
                    return
                  }
                  setShowReportDialog(true)
                }}
                variant="outline"
                className="w-full md:w-auto"
              >
                <Flag className="mr-2 h-4 w-4" />
                {tCommon('report') || '举报'}
              </Button>
            </div>
          )}
        </div>
      </Card>

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
            {postsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : userPosts.length === 0 && !isOwnProfile ? (
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
                        分享你的想法和图片
                      </p>
                    </div>
                  </Card>
                )}
                {/* User Posts */}
                {userPosts.map((post) => (
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

      {/* 举报对话框 */}
      {!isOwnProfile && (
        <ReportDialog
          open={showReportDialog}
          onClose={() => setShowReportDialog(false)}
          reportedType="user"
          reportedId={userId}
        />
      )}
    </div>
  )
}
