'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useFollow } from '@/lib/hooks/useProfile'
import { useRepost } from '@/lib/hooks/useRepost'
import { showError, showInfo, showSuccess, showWarning } from '@/lib/utils/toast'
import { logAudit } from '@/lib/api/audit'

import type { ListPostDTO } from './types'
import type { PostCardCapabilities } from './types'

export interface UsePostActionsParams {
  dto: ListPostDTO
  capabilities: PostCardCapabilities
}

export interface PostActions {
  isDeleting: boolean
  repostPending: boolean
  requestReportDialog: () => boolean
  unfollowAuthor: () => void
  repostToUsers: (targetUserIds: string[], content?: string) => Promise<'ok' | 'error'>
  copyLink: () => Promise<void>
  deletePost: () => Promise<void>
}

export function usePostActions({ dto, capabilities }: UsePostActionsParams): PostActions {
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const deleteInProgressRef = useRef(false)

  const followMutation = useFollow()
  const repostMutation = useRepost()

  const [isDeleting, setIsDeleting] = useState(false)

  const requestReportDialog = useCallback(() => {
    if (!capabilities.canReport) return false
    if (!user) {
      showInfo(t('pleaseLoginToReport'))
      return false
    }
    return true
  }, [capabilities.canReport, t, user])

  const unfollowAuthor = useCallback(() => {
    if (!capabilities.canFollowAuthor) return
    if (!user) {
      showInfo(tCommon('pleaseLoginFirst'))
      return
    }
    followMutation.mutate({
      followingId: dto.author.id,
      shouldFollow: false,
    })
    showSuccess(t('unfollowSuccess'))
  }, [capabilities.canFollowAuthor, dto.author.id, followMutation, t, tCommon, user])

  const repostToUsers = useCallback(
    async (targetUserIds: string[], content?: string): Promise<'ok' | 'error'> => {
      if (!capabilities.canRepost) return 'error'
      if (!user) {
        showInfo(t('pleaseLoginToRepost'))
        return 'error'
      }

      return await new Promise((resolve) => {
        repostMutation.mutate(
          { itemType: 'post', itemId: dto.id, targetUserIds, content },
          {
            onSuccess: (result) => {
              if (result.count > 0 && result.alreadyExists > 0) {
                showSuccess(t('repostSuccessWithExists', { count: result.count, alreadyExists: result.alreadyExists }))
              } else if (result.count > 0) {
                showSuccess(t('repostSuccess', { count: result.count }))
              } else if (result.alreadyExists > 0) {
                showInfo(t('repostAlreadyExists'))
              } else {
                showError(t('repostFailed'))
              }
              resolve('ok')
            },
            onError: (error: any) => {
              console.error('Repost error:', error)
              showError(t('repostFailed'))
              resolve('error')
            },
          }
        )
      })
    },
    [capabilities.canRepost, dto.id, repostMutation, t, user]
  )

  const copyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/post/${dto.id}`
      await navigator.clipboard.writeText(url)
      showSuccess(t('linkCopied'))

      if (user) {
        try {
          const { error } = await supabase.from('shares').insert({
            user_id: user.id,
            item_type: 'post',
            item_id: dto.id,
          })
          if (error) throw error
        } catch (error) {
          const msg = String((error as any)?.message ?? '')
          if (msg.includes('Rate limit exceeded')) {
            showWarning(t('rateLimitExceededShort'))
          } else {
            console.error('Failed to create share record:', error)
          }
        }
      }
    } catch {
      showError(t('copyLinkFailed'))
    }
  }, [dto.id, supabase, t, user])

  const deletePost = useCallback(async () => {
    if (!capabilities.canDelete) return
    if (!user) {
      showError(t('noPermissionToDelete'))
      return
    }
    if (deleteInProgressRef.current) return
    if (!confirm(t('confirmDeletePost'))) return

    deleteInProgressRef.current = true
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('posts').delete().eq('id', dto.id).eq('user_id', user.id)
      if (error) throw error

      logAudit({
        action: 'delete_post',
        userId: user.id,
        resourceId: dto.id,
        resourceType: 'post',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
      showSuccess(t('postDeleted'))
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['userPosts'] })
      queryClient.invalidateQueries({ queryKey: ['post', dto.id] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    } catch (error: any) {
      console.error('Delete post error:', error)
      showError(t('deletePostFailed'))
    } finally {
      deleteInProgressRef.current = false
      setIsDeleting(false)
    }
  }, [capabilities.canDelete, dto.id, queryClient, supabase, t, user])

  return {
    isDeleting,
    repostPending: repostMutation.isPending,
    requestReportDialog,
    unfollowAuthor,
    repostToUsers,
    copyLink,
    deletePost,
  }
}

