'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useProfile, useProfileFollowers } from '@/lib/hooks/useProfile'
import { FollowButton } from '@/components/social/FollowButton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, ArrowLeft, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProfileFollowersPage() {
  const params = useParams()
  const userId = params.id as string
  const { data: profile } = useProfile(userId)
  const { data: followers = [], isLoading } = useProfileFollowers(userId)
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')

  useEffect(() => {
    document.title = t('followersPageTitle')
  }, [t])

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-2 sm:px-4 py-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('backToProfile')}>
          <Link href={`/profile/${userId}`}>
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" aria-hidden />
          {t('followers')}
          {profile?.profile && (
            <span className="text-muted-foreground font-normal text-base">
              ({profile.profile.follower_count})
            </span>
          )}
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12" role="status" aria-label={tCommon('loading')}>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sr-only">{t('followersPageTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {followers.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noFollowers')}</p>
            ) : (
              <div className="space-y-1">
                {followers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                  >
                    <Link href={`/profile/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage src={u.avatar_url ?? undefined} alt={u.display_name ?? u.username ?? t('userFallback')} />
                        <AvatarFallback aria-hidden>
                          {(u.display_name ?? u.username ?? t('userInitial')).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{u.display_name ?? u.username}</div>
                        <div className="text-sm text-muted-foreground truncate">@{u.username}</div>
                      </div>
                    </Link>
                    <div className="flex-shrink-0">
                      <FollowButton userId={u.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
