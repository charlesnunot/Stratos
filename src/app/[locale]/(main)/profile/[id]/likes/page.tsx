'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useProfile } from '@/lib/hooks/useProfile'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT, mapRowToPost } from '@/lib/posts/shared'
import { mapProfilePostToListPostDTO } from '@/lib/post-card/mappers'
import { PostCardUnit } from '@/components/social/PostCardUnit'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, ArrowLeft, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProfileLikesPage() {
  const params = useParams()
  const userId = params.id as string
  const { data: profile } = useProfile(userId)
  const supabase = createClient()
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['userPostsByLikes', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('user_id', userId)
        .eq('status', 'approved')
        .order('like_count', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data || []).map(mapRowToPost)
    },
    enabled: !!userId,
  })
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')

  useEffect(() => {
    document.title = t('likesPageTitle')
  }, [t])

  const listDtos = posts.map(mapProfilePostToListPostDTO)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-2 sm:px-4 py-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t('backToProfile')}>
          <Link href={`/profile/${userId}`}>
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Heart className="h-6 w-6" aria-hidden />
          {t('likesPageTitle')}
          {!isLoading && (
            <span className="text-muted-foreground font-normal text-base">
              ({listDtos.length})
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
            <CardTitle className="text-base sr-only">{t('likesPageTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {listDtos.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{t('noPosts')}</p>
            ) : (
              <div className="space-y-4">
                {listDtos.map((dto) => (
                  <PostCardUnit key={dto.id} dto={dto} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
