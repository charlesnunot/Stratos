import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { MessageSquare, Heart, FileText, Flag, ClipboardList, TrendingUp, AlertTriangle } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'

type TopicRow = { id: string; name: string; slug: string; follower_count: number }

async function fetchCommunityStats(
  supabase: SupabaseClient,
  last7d: Date
): Promise<{
  postsLast7d: number
  commentsLast7d: number
  likesLast7d: number
  pendingReports: number
  pendingPosts: number
  topTopics: TopicRow[]
  highPostCountUsers24h: number
}> {
  const out = {
    postsLast7d: 0,
    commentsLast7d: 0,
    likesLast7d: 0,
    pendingReports: 0,
    pendingPosts: 0,
    topTopics: [] as TopicRow[],
    highPostCountUsers24h: 0,
  }
  try {
    const [postsRes, commentsRes, likesRes, reportsRes, pendingPostsRes, topicsRes, highPostRes] =
      await Promise.allSettled([
        supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', last7d.toISOString())
          .eq('status', 'approved'),
        supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', last7d.toISOString()),
        supabase
          .from('likes')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', last7d.toISOString()),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('topics')
          .select('id, name, slug, follower_count')
          .order('follower_count', { ascending: false })
          .limit(10),
        (async () => {
          const { data } = await supabase
            .from('posts')
            .select('user_id')
            .gte('created_at', last7d.toISOString())
          if (!data?.length) return 0
          const byUser = data.reduce(
            (acc: Record<string, number>, p: { user_id: string }) => {
              acc[p.user_id] = (acc[p.user_id] ?? 0) + 1
              return acc
            },
            {} as Record<string, number>
          )
          return Object.values(byUser).filter((c) => c > 10).length
        })(),
      ])
    if (postsRes.status === 'fulfilled' && !postsRes.value.error)
      out.postsLast7d = postsRes.value.count ?? 0
    if (commentsRes.status === 'fulfilled' && !commentsRes.value.error)
      out.commentsLast7d = commentsRes.value.count ?? 0
    if (likesRes.status === 'fulfilled' && !likesRes.value.error)
      out.likesLast7d = likesRes.value.count ?? 0
    if (reportsRes.status === 'fulfilled' && !reportsRes.value.error)
      out.pendingReports = reportsRes.value.count ?? 0
    if (pendingPostsRes.status === 'fulfilled' && !pendingPostsRes.value.error)
      out.pendingPosts = pendingPostsRes.value.count ?? 0
    if (topicsRes.status === 'fulfilled' && !topicsRes.value.error && topicsRes.value.data?.length)
      out.topTopics =
        (topicsRes.value.data as TopicRow[]) ?? []
    if (highPostRes.status === 'fulfilled' && typeof highPostRes.value === 'number')
      out.highPostCountUsers24h = highPostRes.value
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Admin community stats:', e)
    }
  }
  return out
}

export default async function AdminCommunityPage() {
  const t = await getTranslations('admin')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  const now = new Date()
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const stats = await fetchCommunityStats(supabase, last7d)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">社区运营</h1>
      <p className="text-muted-foreground">近 7 天活跃度、话题热度与举报/审核队列概览</p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            近 7 天发帖（已通过）
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.postsLast7d}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            近 7 天评论
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.commentsLast7d}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Heart className="h-4 w-4" />
            近 7 天点赞
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.likesLast7d}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag className="h-4 w-4" />
            待处理举报
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.pendingReports}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('communityAlert')}
          </h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span>{t('pendingReportsLabel')}</span>
              <span className={stats.pendingReports > 0 ? 'font-semibold text-destructive' : ''}>
                {stats.pendingReports}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t('highPostUsersDesc')}</span>
              <span
                className={
                  stats.highPostCountUsers24h > 0 ? 'font-semibold text-amber-600' : ''
                }
              >
                {stats.highPostCountUsers24h}
              </span>
            </li>
          </ul>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('topicHeatTitle')}
          </h3>
          {stats.topTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noTopicsData')}</p>
          ) : (
            <ul className="space-y-2">
              {stats.topTopics.map((topic) => (
                <li key={topic.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">#{topic.name}</span>
                  <span className="text-muted-foreground">{topic.follower_count ?? 0} {t('followersLabel')}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/content-review" className="mt-4 inline-block">
            <Button variant="outline" size="sm">{t('contentReviewLabel')}</Button>
          </Link>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            {t('reviewAndReports')}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('pendingPostsAndReports', { posts: stats.pendingPosts, reports: stats.pendingReports })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/content-review">
              <Button size="sm">{t('contentReviewLabel')}</Button>
            </Link>
            <Link href="/admin/reports">
              <Button variant="outline" size="sm">{t('reportsTitle')}</Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        <Link href="/admin/dashboard">
          <Button variant="outline">{t('backToDashboard')}</Button>
        </Link>
      </div>
    </div>
  )
}
