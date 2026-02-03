'use client'

import { useState } from 'react'
import { useFollowing, useFollowers } from '@/lib/hooks/useProfile'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, X, Users, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/hooks/useAuth'

interface RepostDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (targetUserIds: string[], content?: string) => void
  isLoading?: boolean
}

export function RepostDialog({ open, onClose, onConfirm, isLoading = false }: RepostDialogProps) {
  const { user } = useAuth()
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [repostContent, setRepostContent] = useState('')
  const [activeTab, setActiveTab] = useState<'following' | 'followers'>('following')
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  const { data: following = [], isLoading: followingLoading } = useFollowing()
  const { data: followers = [], isLoading: followersLoading } = useFollowers()

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  const handleConfirm = () => {
    if (selectedUserIds.length > 0) {
      onConfirm(selectedUserIds, repostContent.trim() || undefined)
      setSelectedUserIds([])
      setSearchQuery('')
      setRepostContent('')
    }
  }

  const handleClose = () => {
    setSelectedUserIds([])
    setSearchQuery('')
    setRepostContent('')
    onClose()
  }

  // 过滤用户列表
  const filterUsers = (users: typeof following) => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase()
    return users.filter(
      (user) =>
        user.display_name?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query)
    )
  }

  const currentUsers = activeTab === 'following' ? following : followers
  const filteredUsers = filterUsers(currentUsers)
  const isLoadingUsers = activeTab === 'following' ? followingLoading : followersLoading

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('repost')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          {/* 评论输入框 */}
          <div className="shrink-0">
            <Textarea
              placeholder={t('addRepostComment')}
              value={repostContent}
              onChange={(e) => setRepostContent(e.target.value)}
              className="w-full min-h-[80px] resize-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {repostContent.length}/500
            </p>
          </div>

          {/* 搜索框 */}
          <div className="shrink-0 relative z-10">
            <Input
              placeholder={t('searchUsers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary"
            />
          </div>

          {/* 标签页 */}
          <div className="flex border-b shrink-0">
            <button
              onClick={() => setActiveTab('following')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'following'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserPlus className="inline-block mr-2 h-4 w-4" />
              {t('following')} ({following.length})
            </button>
            <button
              onClick={() => setActiveTab('followers')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'followers'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="inline-block mr-2 h-4 w-4" />
              {t('followers')} ({followers.length})
            </button>
          </div>

          {/* 用户列表 */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {activeTab === 'following' ? t('noFollowing') : t('noFollowers')}
              </div>
            ) : (
              filteredUsers.map((userItem) => {
                const isSelected = selectedUserIds.includes(userItem.id)
                return (
                  <div
                    key={userItem.id}
                    className={`flex items-center gap-3 rounded-md p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border border-primary'
                        : 'hover:bg-muted border border-transparent'
                    }`}
                    onClick={() => handleToggleUser(userItem.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleUser(userItem.id)}
                      className="h-4 w-4 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {userItem.avatar_url ? (
                      <img
                        src={userItem.avatar_url}
                        alt={userItem.display_name || userItem.username}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold">
                          {(userItem.display_name || userItem.username || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {userItem.display_name || userItem.username}
                      </p>
                      {userItem.display_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          @{userItem.username}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* 已选择提示 */}
          {selectedUserIds.length > 0 && (
            <p className="text-xs text-muted-foreground shrink-0">
              {t('selectedUsers', { count: selectedUserIds.length })}
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || selectedUserIds.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('reposting')}
              </>
            ) : (
              tCommon('confirm')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
