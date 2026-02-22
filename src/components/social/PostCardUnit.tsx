'use client'

import { useMemo } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFollowing, useProfile } from '@/lib/hooks/useProfile'
import type { ListPostDTO } from '@/lib/post-card/types'
import type { PostCardViewerKind } from '@/lib/post-card/types'
import { computePostCardCapabilities, computePostCardState } from '@/lib/post-card/state'
import { usePostActions } from '@/lib/post-card/usePostActions'
import { PostCardView } from '@/components/social/post-card/PostCardView'

export interface PostCardUnitProps {
  dto: ListPostDTO
}

export function PostCardUnit({ dto }: PostCardUnitProps) {
  const { user } = useAuth()
  const viewerId = user?.id ?? null
  const { data: profileData } = useProfile(user?.id ?? '')
  const isAdminOrSupport =
    (profileData as any)?.role === 'admin' || (profileData as any)?.role === 'support'

  const { data: isFollowing } = useIsFollowing(dto.author.id)

  const dtoWithViewer = useMemo<ListPostDTO>(() => {
    return {
      ...dto,
      viewerInteraction: {
        ...dto.viewerInteraction,
        isFollowingAuthor: !!isFollowing,
      },
    }
  }, [dto, isFollowing])

  const viewerKindOverride: PostCardViewerKind | undefined =
    isAdminOrSupport && viewerId && viewerId !== dto.author.id ? 'admin' : undefined

  const state = useMemo(
    () => computePostCardState({ dto: dtoWithViewer, viewerId, viewerKindOverride }),
    [dtoWithViewer, viewerId, viewerKindOverride]
  )
  const capabilities = useMemo(
    () => computePostCardCapabilities({ state, dto: dtoWithViewer }),
    [state, dtoWithViewer]
  )

  const actions = usePostActions({ dto: dtoWithViewer, capabilities })

  return (
    <PostCardView dto={dtoWithViewer} state={state} capabilities={capabilities} actions={actions} />
  )
}

