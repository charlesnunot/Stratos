import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContentReview } from '@/components/admin/ContentReview'
import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'

export default async function AdminReviewPage() {
  const t = await getTranslations('admin')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    redirect('/')
  }

  const { count: pendingPosts } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: pendingProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('contentReview')}</h1>
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">{t('backToDashboard')}</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingPosts')}</p>
          <p className="text-2xl font-bold">{pendingPosts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingProducts')}</p>
          <p className="text-2xl font-bold">{pendingProducts || 0}</p>
        </Card>
      </div>

      <ContentReview />
    </div>
  )
}
