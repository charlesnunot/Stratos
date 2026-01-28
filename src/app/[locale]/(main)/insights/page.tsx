'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Loader2, TrendingUp, Eye, Heart, MessageCircle, Users, User, FileText, ShoppingBag } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function InsightsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('insights')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['insights', user?.id],
    queryFn: async () => {
      if (!user) return null

      // Get user's posts stats
      const { data: posts, count: postsCount } = await supabase
        .from('posts')
        .select('like_count, comment_count, share_count', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('status', 'approved')

      const totalLikes = posts?.reduce((sum, post) => sum + (post.like_count || 0), 0) || 0
      const totalComments = posts?.reduce((sum, post) => sum + (post.comment_count || 0), 0) || 0
      const totalShares = posts?.reduce((sum, post) => sum + (post.share_count || 0), 0) || 0

      // Get profile stats
      const { data: profile } = await supabase
        .from('profiles')
        .select('follower_count, following_count')
        .eq('id', user.id)
        .single()

      // 浏览量/访客量（近 30 天）：RPC get_view_summary
      let profilePv = 0
      let profileUv = 0
      let postPv = 0
      let postUv = 0
      let productPv = 0
      let productUv = 0
      const days = 30
      try {
        const [profileRes, postRes, productRes] = await Promise.all([
          supabase.rpc('get_view_summary', { p_owner_id: user.id, p_entity_type: 'profile', p_days: days }),
          supabase.rpc('get_view_summary', { p_owner_id: user.id, p_entity_type: 'post', p_days: days }),
          supabase.rpc('get_view_summary', { p_owner_id: user.id, p_entity_type: 'product', p_days: days }),
        ])
        const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
        ;(profileRes.data || []).forEach((r: { entity_id: string; pv: number; uv: number }) => {
          profilePv += toNum(r.pv)
          profileUv += toNum(r.uv)
        })
        ;(postRes.data || []).forEach((r: { entity_id: string; pv: number; uv: number }) => {
          postPv += toNum(r.pv)
          postUv += toNum(r.uv)
        })
        ;(productRes.data || []).forEach((r: { entity_id: string; pv: number; uv: number }) => {
          productPv += toNum(r.pv)
          productUv += toNum(r.uv)
        })
      } catch (_) {
        // RPC 可能尚未部署或表为空，忽略
      }

      return {
        postsCount: postsCount || 0,
        totalLikes,
        totalComments,
        totalShares,
        followers: profile?.follower_count || 0,
        following: profile?.following_count || 0,
        profilePv,
        profileUv,
        postPv,
        postUv,
        productPv,
        productUv,
      }
    },
    enabled: !!user,
  })

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t('pleaseLogin')}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
      </div>
    )
  }

  const engagementCards = [
    { label: t('postsCount'), value: stats.postsCount, icon: TrendingUp, color: 'text-blue-500' },
    { label: t('totalLikes'), value: stats.totalLikes, icon: Heart, color: 'text-red-500' },
    { label: t('totalComments'), value: stats.totalComments, icon: MessageCircle, color: 'text-green-500' },
    { label: t('totalShares'), value: stats.totalShares, icon: Eye, color: 'text-purple-500' },
    { label: t('followers'), value: stats.followers, icon: Users, color: 'text-orange-500' },
    { label: t('following'), value: stats.following, icon: Users, color: 'text-indigo-500' },
  ]

  const viewCards = [
    { label: t('profileViews'), value: stats.profilePv, icon: User, color: 'text-sky-500' },
    { label: t('profileVisitors'), value: stats.profileUv, icon: User, color: 'text-sky-600' },
    { label: t('postViews'), value: stats.postPv, icon: FileText, color: 'text-amber-500' },
    { label: t('postVisitors'), value: stats.postUv, icon: FileText, color: 'text-amber-600' },
    { label: t('productViews'), value: stats.productPv, icon: ShoppingBag, color: 'text-emerald-500' },
    { label: t('productVisitors'), value: stats.productUv, icon: ShoppingBag, color: 'text-emerald-600' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>

      <h2 className="mb-4 text-lg font-semibold">{t('viewsSectionTitle')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('viewsSectionDesc')}</p>
      <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {viewCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                </div>
                <Icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </Card>
          )
        })}
      </div>

      <h2 className="mb-4 text-lg font-semibold">{t('engagementSectionTitle')}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {engagementCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                </div>
                <Icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
