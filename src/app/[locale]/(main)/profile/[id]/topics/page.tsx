'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useFollowedTopics } from '@/lib/hooks/useTopics'
import { TopicTag } from '@/components/social/TopicTag'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, Hash, ArrowLeft } from 'lucide-react'

export default function ProfileFollowedTopicsPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { user } = useAuth()
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')

  const { data: topics, isLoading } = useFollowedTopics(userId)

  useEffect(() => {
    if (!user) return
    if (userId !== user.id) {
      router.replace(`/profile/${user.id}/topics`)
      return
    }
  }, [user, userId, router])

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">{t('topicsPleaseLogin')}</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/login">{tCommon('login')}</Link>
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/profile/${userId}`} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
      </div>

      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold">
        <Hash className="h-6 w-6" />
        {t('followedTopicsPageTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {t('followedTopicsDescription')}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !topics || topics.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('noFollowedTopics')}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('followedTopicsDiscoverHint')}
            </p>
            <Button variant="outline" asChild className="mt-4">
              <Link href="/feed">{t('discoverTopics')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <TopicTag key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </div>
  )
}
