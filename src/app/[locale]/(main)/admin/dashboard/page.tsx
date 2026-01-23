import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContentReview } from '@/components/admin/ContentReview'
import { ReportManagement } from '@/components/admin/ReportManagement'
import { CommissionManagement } from '@/components/admin/CommissionManagement'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { CreditCard } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/')
  }

  // Get stats
  const { count: pendingPosts } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: pendingProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: pendingReports } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: pendingCommissions } = await supabase
    .from('affiliate_commissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">管理后台</h1>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">待审核帖子</p>
          <p className="text-2xl font-bold">{pendingPosts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">待审核商品</p>
          <p className="text-2xl font-bold">{pendingProducts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">待处理举报</p>
          <p className="text-2xl font-bold">{pendingReports || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">待结算佣金</p>
          <p className="text-2xl font-bold">{pendingCommissions || 0}</p>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">平台支付账户管理</h3>
              <p className="text-sm text-muted-foreground mb-4">
                管理平台用于接收订阅费用的支付账户配置（Stripe、PayPal、支付宝、微信支付）
              </p>
              <Link href="/admin/platform-payment-accounts">
                <Button>
                  <CreditCard className="h-4 w-4 mr-2" />
                  管理平台支付账户
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">用户支付账户审核</h3>
              <p className="text-sm text-muted-foreground mb-4">
                审核和管理用户（卖家）的支付账户
              </p>
              <Link href="/admin/payment-accounts">
                <Button variant="outline">
                  查看支付账户
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* Content Review */}
      <ContentReview />

      {/* Report Management */}
      <ReportManagement />

      {/* Commission Management */}
      <CommissionManagement />
    </div>
  )
}
