'use client'

import { useParams } from 'next/navigation'
import { usePost } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

export default function EditPostPage() {
  const params = useParams()
  const postId = params.id as string
  const { data: post, isLoading, error } = usePost(postId)
  const { user, loading: authLoading } = useAuth()
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  if (isLoading || authLoading) {
    return <LoadingState />
  }

  if (error || !post) {
    return <EmptyState title="帖子不存在或加载失败" />
  }

  if (!user || user.id !== post.user_id) {
    return (
      <div className="mx-auto max-w-md py-12 px-4">
        <EmptyState title="您没有权限编辑该帖子" />
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/post/${postId}`}>返回帖子</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">取消</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('editPost')}</h1>
      <Card className="p-6">
        <p className="text-muted-foreground mb-6">
          编辑功能即将上线，届时可在此修改帖子内容、图片与话题。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/post/${postId}`} className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              返回帖子
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/profile/${user.id}`}>返回个人页</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
