'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useNewFollowers, useRecommendedForMe, type PeopleUser } from '@/lib/hooks/usePeople'
import { FollowButton } from '@/components/social/FollowButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, Users, UserPlus, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

function UserRow({ u, showMutual }: { u: PeopleUser; showMutual?: boolean }) {
  const t = useTranslations('profile')
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-accent transition-colors">
      <Link href={`/profile/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={u.avatar_url ?? undefined} alt={u.display_name ?? u.username} />
          <AvatarFallback>
            {(u.display_name ?? u.username ?? t('userInitial')).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{u.display_name ?? u.username}</div>
          <div className="text-sm text-muted-foreground truncate">@{u.username}</div>
          {showMutual && u.isMutualFriend && (
            <div className="text-xs text-muted-foreground">{t('mutualFriend')}</div>
          )}
        </div>
      </Link>
      <div className="flex-shrink-0">
        <FollowButton userId={u.id} />
      </div>
    </div>
  )
}

export default function ProfilePeoplePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { user } = useAuth()
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const { data: newFollowers, isLoading: loadingNew } = useNewFollowers(userId, 30)
  const { data: recommended, isLoading: loadingRec } = useRecommendedForMe(12)

  useEffect(() => {
    if (!user) return
    if (userId !== user.id) {
      router.replace(`/profile/${user.id}/people`)
      return
    }
  }, [user, userId, router])

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">{t('peoplePleaseLogin')}</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/login">{tCommon('retry')}</Link>
        </Button>
      </div>
    )
  }

  if (userId !== user.id) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isLoading = loadingNew || loadingRec

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-2 sm:px-4 py-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/profile/${userId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t('peoplePageTitle')}</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                {t('newFollowers')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!newFollowers || newFollowers.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">{t('noNewFollowers')}</p>
              ) : (
                <div className="space-y-1">
                  {newFollowers.map((u) => (
                    <UserRow key={u.id} u={u} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('recommendedFriends')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!recommended || recommended.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">{t('noRecommendedFriends')}</p>
              ) : (
                <div className="space-y-1">
                  {recommended.map((u) => (
                    <UserRow key={u.id} u={u} showMutual />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
