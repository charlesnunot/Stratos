'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Users, UserPlus, UserMinus } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useGroupPosts } from '@/lib/hooks/usePosts'
import { useTranslations } from 'next-intl'
import { PostCardUnit } from '@/components/social/PostCardUnit'
import { mapFeedPostToListPostDTO } from '@/lib/post-card/mappers'
import { showSuccess, showError } from '@/lib/utils/toast'
import { PostCardSkeleton } from '@/components/ui/skeleton'

const POST_TYPE_FILTER_OPTIONS = [
  { value: '', labelKey: 'filterAll' },
  { value: 'normal', labelKey: 'filterPostTypeNormal' },
  { value: 'story', labelKey: 'filterPostTypeStory' },
  { value: 'music', labelKey: 'filterPostTypeMusic' },
  { value: 'short_video', labelKey: 'filterPostTypeShortVideo' },
]

export default function GroupSlugPage() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const t = useTranslations('groups')
  const tCommon = useTranslations('common')
  const [postTypeFilter, setPostTypeFilter] = useState<string>('')

  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ['communityGroup', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_groups')
        .select('*')
        .eq('slug', slug)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!slug,
  })

  const { data: isMember } = useQuery({
    queryKey: ['groupMember', group?.id, user?.id],
    queryFn: async () => {
      if (!user || !group?.id) return false
      const { data } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .maybeSingle()
      return !!data
    },
    enabled: !!group?.id && !!user,
  })

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/community-groups/${group!.id}/join`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'join_failed')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupMember', group?.id, user?.id] })
      queryClient.invalidateQueries({ queryKey: ['communityGroup', slug] })
      showSuccess(t('joined'))
    },
    onError: (e: Error) => showError(e.message),
  })

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/community-groups/${group!.id}/leave`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'leave_failed')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupMember', group?.id, user?.id] })
      queryClient.invalidateQueries({ queryKey: ['communityGroup', slug] })
      showSuccess(t('left'))
    },
    onError: (e: Error) => showError(e.message),
  })

  const {
    data: postsData,
    isLoading: postsLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useGroupPosts(group?.id, { enabled: !!group?.id, postType: postTypeFilter || undefined })
  const posts = postsData?.pages.flatMap((p) => p) ?? []

  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const el = loadMoreRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchNextPage() },
      { rootMargin: '200px', threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!slug || groupLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('notFound')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="overflow-hidden">
        {group.cover_url ? (
          <div className="aspect-[3/1] bg-muted">
            <img src={group.cover_url} alt={group.name} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex aspect-[3/1] items-center justify-center bg-muted">
            <Users className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        <div className="p-4 md:p-6">
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.description && <p className="mt-2 text-muted-foreground">{group.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {group.member_count ?? 0} {t('members')}
            </span>
            {user && (
              isMember ? (
                <Button variant="outline" size="sm" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}>
                  <UserMinus className="mr-1 h-4 w-4" />
                  {t('leave')}
                </Button>
              ) : (
                <Button size="sm" onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
                  <UserPlus className="mr-1 h-4 w-4" />
                  {t('join')}
                </Button>
              )
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t('postsInGroup')}</h2>
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
        <MasonryGrid>
          {[...Array(6)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </MasonryGrid>
      ) : posts.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">{t('noPosts')}</Card>
      ) : (
        <>
          <MasonryGrid>
            {posts.map((post) => (
              <PostCardUnit key={post.id} dto={mapFeedPostToListPostDTO(post)} />
            ))}
          </MasonryGrid>
          {hasNextPage && (
            <div ref={loadMoreRef} className="h-4 w-full" />
          )}
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
