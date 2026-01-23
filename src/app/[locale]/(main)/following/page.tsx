'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCard } from '@/components/social/PostCard'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { usePosts } from '@/lib/hooks/usePosts'
import { useTranslations } from 'next-intl'

export default function FollowingPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('following')

  // Get users that current user is following
  const { data: following, isLoading: followingLoading } = useQuery({
    queryKey: ['following', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', user.id)

      if (error) throw error
      return (data || []).map((f) => f.followee_id) as string[]
    },
    enabled: !!user,
  })

  // Get all approved posts
  const { data: postsData, isLoading: postsLoading } = usePosts('approved')

  // Filter posts to only show posts from users being followed
  const followingPosts = postsData?.pages
    .flatMap((page) => page)
    .filter((post) => following?.includes(post.user_id)) || []

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t('pleaseLogin')}</p>
      </div>
    )
  }

  const isLoadingFollowing = followingLoading || postsLoading

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>

      {isLoadingFollowing ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : following && following.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="mb-4 text-muted-foreground">{t('notFollowingAnyone')}</p>
          <p className="text-sm text-muted-foreground">
            {t('discoverMessage')}
          </p>
        </Card>
      ) : followingPosts.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{t('noPostsFromFollowing')}</p>
        </Card>
      ) : (
        <div className="-mx-2 sm:-mx-4 md:mx-0">
          <MasonryGrid>
            {followingPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </MasonryGrid>
        </div>
      )}
    </div>
  )
}
