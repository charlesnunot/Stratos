'use client'

import { useState } from 'react'
import { MoreHorizontal, Share2, EyeOff, Ban, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ShareDialog } from './ShareDialog'
import { ReportDialog } from './ReportDialog'
import { useBlock, useIsBlocked } from '@/lib/hooks/useBlock'
import { useRestrictView, useIsRestricted } from '@/lib/hooks/useRestrictView'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'
import { showSuccess, showError } from '@/lib/utils/toast'

interface ProfileMoreMenuProps {
  targetUserId: string
  targetUserName?: string
  targetUserAvatar?: string | null
}

export function ProfileMoreMenu({
  targetUserId,
  targetUserName,
  targetUserAvatar,
}: ProfileMoreMenuProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const t = useTranslations('common')
  const tProfile = useTranslations('profile')
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const { data: isBlocked, isLoading: isBlockedLoading } = useIsBlocked(targetUserId)
  const { data: isRestricted, isLoading: isRestrictedLoading } = useIsRestricted(targetUserId)
  const blockMutation = useBlock()
  const restrictViewMutation = useRestrictView()

  // 未登录用户不显示菜单
  if (!user || user.id === targetUserId) {
    return null
  }

  const handleBlock = async () => {
    if (!user) return

    const shouldBlock = !isBlocked
    const name = targetUserName || tProfile('userFallback')
    const confirmMessage = shouldBlock
      ? tProfile('blockConfirm', { name })
      : tProfile('unblockConfirm', { name })

    if (!confirm(confirmMessage)) return

    try {
      await blockMutation.mutateAsync({
        blockedUserId: targetUserId,
        shouldBlock,
      })
      showSuccess(shouldBlock ? tProfile('blockSuccess') : tProfile('unblockSuccess'))
    } catch (error: any) {
      console.error('Block error:', error)
      showError(error.message || t('operationFailed'))
    }
  }

  const handleRestrictView = async () => {
    if (!user) return

    const shouldRestrict = !isRestricted
    const name = targetUserName || tProfile('userFallback')
    const confirmMessage = shouldRestrict
      ? tProfile('restrictConfirm', { name })
      : tProfile('unrestrictConfirm', { name })

    if (!confirm(confirmMessage)) return

    try {
      await restrictViewMutation.mutateAsync({
        restrictedUserId: targetUserId,
        shouldRestrict,
      })
      showSuccess(shouldRestrict ? tProfile('restrictSuccess') : tProfile('unrestrictSuccess'))
    } catch (error: any) {
      console.error('Restrict view error:', error)
      showError(error.message || t('operationFailed'))
    }
  }

  const profileUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/profile/${targetUserId}`
    : ''

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">{tProfile('moreOptions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setShowShareDialog(true)}>
            <Share2 className="mr-2 h-4 w-4" />
            <span>{tProfile('shareUser')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={handleRestrictView}
            disabled={isRestrictedLoading || restrictViewMutation.isPending}
            className={isRestricted ? 'text-muted-foreground' : ''}
          >
            <EyeOff className="mr-2 h-4 w-4" />
            <span>{isRestricted ? tProfile('unrestrictView') : tProfile('restrictView')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={handleBlock}
            disabled={isBlockedLoading || blockMutation.isPending}
            className={isBlocked ? 'text-muted-foreground' : ''}
          >
            <Ban className="mr-2 h-4 w-4" />
            <span>{isBlocked ? tProfile('unblock') : tProfile('block')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
            <Flag className="mr-2 h-4 w-4" />
            <span>{t('report')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 分享对话框 - 扩展支持分享用户 */}
      {showShareDialog && (
        <ShareDialog
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          url={profileUrl}
          title={tProfile('shareUserProfileTitle', { name: targetUserName || tProfile('userFallback') })}
          description={tProfile('shareUserProfileDesc', { name: targetUserName || tProfile('userFallback') })}
          image={targetUserAvatar || undefined}
          itemType="user"
          itemId={targetUserId}
        />
      )}

      {/* 举报对话框 */}
      {showReportDialog && (
        <ReportDialog
          open={showReportDialog}
          onClose={() => setShowReportDialog(false)}
          reportedType="user"
          reportedId={targetUserId}
        />
      )}
    </>
  )
}
