import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContentReview } from '@/components/admin/ContentReview'
import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'

export default async function AdminReviewPage() {
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
        <h1 className="text-3xl font-bold">内容审核</h1>
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">返回管理后台</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">待审核帖子</p>
          <p className="text-2xl font-bold">{pendingPosts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">待审核商品</p>
          <p className="text-2xl font-bold">{pendingProducts || 0}</p>
        </Card>
      </div>

      <ContentReview />
    </div>
  )
}
