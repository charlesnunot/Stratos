'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCard } from '@/components/social/PostCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useTopicPosts } from '@/lib/hooks/usePosts'
import { useIsTopicFollowed, useToggleTopicFollow } from '@/lib/hooks/useTopics'
import { showInfo, showSuccess, showError } from '@/lib/utils/toast'
import { validateTopicParam } from '@/lib/utils/search'

function getDisplayTopicName(
  topic: { name: string; name_translated?: string | null; name_lang?: string | null },
  locale: string
): string {
  const lang = topic.name_lang ?? 'zh'
  return locale === lang ? topic.name : (topic.name_translated ?? topic.name)
}

function decodeTopicParam(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw ?? ''
  }
}

const POST_TYPE_FILTER_OPTIONS = [
  { value: '', labelKey: 'filterAll' },
  { value: 'normal', labelKey: 'filterPostTypeNormal' },
  { value: 'story', labelKey: 'filterPostTypeStory' },
  { value: 'music', labelKey: 'filterPostTypeMusic' },
  { value: 'short_video', labelKey: 'filterPostTypeShortVideo' },
]

export default function TopicPage() {
  const params = useParams()
  const rawTopic = params.topic as string | undefined
  const topicSlug = validateTopicParam(decodeTopicParam(rawTopic))
  const locale = useLocale()
  const tCommon = useTranslations('common')
  const { user } = useAuth()
  const supabase = createClient()
  const [postTypeFilter, setPostTypeFilter] = useState<string>('')

  const { data: topic, isLoading: topicLoading } = useQuery({
    queryKey: ['topic', topicSlug],
    queryFn: async () => {
      if (!topicSlug) return null
      const { data: bySlug, error: slugError } = await supabase
        .from('topics')
        .select('*')
        .eq('slug', topicSlug)
        .maybeSingle()

      if (slugError) throw slugError
      if (bySlug) return bySlug

      const { data: byName, error: nameError } = await supabase
        .from('topics')
        .select('*')
        .eq('name', topicSlug)
        .maybeSingle()

      if (nameError) throw nameError
      return byName ?? null
    },
    enabled: !!topicSlug,
  })

  const { data: isFollowed } = useIsTopicFollowed(topic?.id)
  const toggleFollowMutation = useToggleTopicFollow()

  // 按话题 ID 分页拉取已审核帖子，支持按 post_type 筛选
  const {
    data: postsData,
    isLoading: postsLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useTopicPosts(topic?.id, { enabled: !!topic?.id, postType: postTypeFilter || undefined })
  const topicPosts = postsData?.pages.flatMap((page) => page) ?? []

  if (!topicSlug || topicLoading) {
    if (!topicSlug) {
      return (
        <div className="py-12 text-center">
          <p className="text-destructive">话题不存在</p>
        </div>
      )
    }
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
            <h1 className="text-3xl font-bold">#{getDisplayTopicName(topic, locale)}</h1>
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

      {/* Posts + 阶段4：按 post_type 筛选 */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold mr-4">相关帖子</h2>
          <div className="flex flex-wrap gap-1">
            {POST_TYPE_FILTER_OPTIONS.map(({ value, labelKey }) => (
              <Button
                key={value || 'all'}
                variant={postTypeFilter === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPostTypeFilter(value)}
              >
                {tCommon(labelKey)}
              </Button>
            ))}
          </div>
        </div>
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
            {hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      加载中…
                    </>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
