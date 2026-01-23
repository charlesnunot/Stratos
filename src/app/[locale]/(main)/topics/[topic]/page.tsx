'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCard } from '@/components/social/PostCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { usePosts } from '@/lib/hooks/usePosts'
import { useIsTopicFollowed, useToggleTopicFollow } from '@/lib/hooks/useTopics'
import { showInfo, showSuccess, showError } from '@/lib/utils/toast'

export default function TopicPage() {
  const params = useParams()
  const topicSlug = params.topic as string
  const { user } = useAuth()
  const supabase = createClient()

  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ['topic', topicSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .eq('slug', topicSlug)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!topicSlug,
  })

  const { data: isFollowed } = useIsTopicFollowed(topic?.id)
  const toggleFollowMutation = useToggleTopicFollow()

  // Get posts for this topic
  const { data: postsData, isLoading: postsLoading } = usePosts('approved')
  const topicPosts = postsData?.pages
    .flatMap((page) => page)
    .filter((post) => post.topics?.some((t) => t.slug === topicSlug)) || []

  if (topicLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!topic) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">话题不存在</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 mx-auto max-w-7xl px-2 sm:px-4">
      {/* Topic Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">#{topic.name}</h1>
            {topic.description && (
              <p className="mt-2 text-muted-foreground">{topic.description}</p>
            )}
            <div className="mt-4 flex gap-6 text-sm">
              <span>
                <span className="font-semibold">{topic.post_count || 0}</span>{' '}
                帖子
              </span>
              <span>
                <span className="font-semibold">{topic.follower_count || 0}</span>{' '}
                关注者
              </span>
            </div>
          </div>
          {user && (
            <Button
              variant={isFollowed ? 'outline' : 'default'}
              disabled={toggleFollowMutation.isPending}
              onClick={() => {
                if (!user) {
                  showInfo('请先登录后再关注')
                  return
                }
                if (!topic?.id) return
                toggleFollowMutation.mutate(
                  { topicId: topic.id, shouldFollow: !isFollowed },
                  {
                    onSuccess: () => {
                      showSuccess(isFollowed ? '已取消关注话题' : '已关注话题')
                    },
                    onError: (err) => {
                      console.error('Toggle topic follow error:', err)
                      showError('操作失败，请重试')
                    },
                  }
                )
              }}
            >
              {isFollowed ? '取消关注' : '关注话题'}
            </Button>
          )}
        </div>
      </Card>

      {/* Posts */}
      <div>
        <h2 className="mb-4 text-xl font-bold">相关帖子</h2>
        {postsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : topicPosts.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">暂无帖子</p>
        ) : (
          <div className="-mx-2 sm:-mx-4 md:mx-0">
            <MasonryGrid>
              {topicPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </MasonryGrid>
          </div>
        )}
      </div>
    </div>
  )
}
