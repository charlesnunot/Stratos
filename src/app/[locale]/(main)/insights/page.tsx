'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Loader2, TrendingUp, Eye, Heart, MessageCircle, Users } from 'lucide-react'
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

      return {
        postsCount: postsCount || 0,
        totalLikes,
        totalComments,
        totalShares,
        followers: profile?.follower_count || 0,
        following: profile?.following_count || 0,
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

  const statCards = [
    {
      label: t('postsCount'),
      value: stats.postsCount,
      icon: TrendingUp,
      color: 'text-blue-500',
    },
    {
      label: t('totalLikes'),
      value: stats.totalLikes,
      icon: Heart,
      color: 'text-red-500',
    },
    {
      label: t('totalComments'),
      value: stats.totalComments,
      icon: MessageCircle,
      color: 'text-green-500',
    },
    {
      label: t('totalShares'),
      value: stats.totalShares,
      icon: Eye,
      color: 'text-purple-500',
    },
    {
      label: t('followers'),
      value: stats.followers,
      icon: Users,
      color: 'text-orange-500',
    },
    {
      label: t('following'),
      value: stats.following,
      icon: Users,
      color: 'text-indigo-500',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => {
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
