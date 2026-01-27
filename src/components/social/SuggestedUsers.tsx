'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FollowButton } from './FollowButton'
import { useSuggestedUsers } from '@/lib/hooks/useSuggestedUsers'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Users } from 'lucide-react'

interface SuggestedUsersProps {
  profileUserId: string
  limit?: number
}

export function SuggestedUsers({ profileUserId, limit = 6 }: SuggestedUsersProps) {
  const { data: suggestedUsers, isLoading } = useSuggestedUsers(profileUserId, limit)
  const t = useTranslations('profile')

  const tCommon = useTranslations('common')

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <span>{t('suggestedUsers')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">{tCommon('loading')}</div>
        </CardContent>
      </Card>
    )
  }

  if (!suggestedUsers || suggestedUsers.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <span>{t('suggestedUsers')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {suggestedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <Link
                href={`/profile/${user.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={user.avatar_url || undefined} alt={user.display_name || user.username} />
                  <AvatarFallback>
                    {(user.display_name || user.username || t('userInitial')).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {user.display_name || user.username}
                  </div>
                  {user.isMutualFriend && (
                    <div className="text-xs text-muted-foreground">
                      {t('mutualFriend')}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-shrink-0">
                <FollowButton userId={user.id} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
