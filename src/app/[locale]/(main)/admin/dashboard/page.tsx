import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContentReview } from '@/components/admin/ContentReview'
import { ReportManagement } from '@/components/admin/ReportManagement'
import { CommissionManagement } from '@/components/admin/CommissionManagement'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { CreditCard, Activity, DollarSign, AlertTriangle } from 'lucide-react'

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

  // Get stats with error handling
  let pendingPosts = 0
  let pendingProducts = 0
  let pendingReports = 0
  let pendingCommissions = 0

  try {
    const [postsResult, productsResult, reportsResult, commissionsResult] = await Promise.allSettled([
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('affiliate_commissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])

    if (postsResult.status === 'fulfilled' && !postsResult.value.error) {
      pendingPosts = postsResult.value.count || 0
    } else {
      console.error('Failed to fetch pending posts:', postsResult.status === 'rejected' ? postsResult.reason : postsResult.value.error)
    }

    if (productsResult.status === 'fulfilled' && !productsResult.value.error) {
      pendingProducts = productsResult.value.count || 0
    } else {
      console.error('Failed to fetch pending products:', productsResult.status === 'rejected' ? productsResult.reason : productsResult.value.error)
    }

    if (reportsResult.status === 'fulfilled' && !reportsResult.value.error) {
      pendingReports = reportsResult.value.count || 0
    } else {
      console.error('Failed to fetch pending reports:', reportsResult.status === 'rejected' ? reportsResult.reason : reportsResult.value.error)
    }

    if (commissionsResult.status === 'fulfilled' && !commissionsResult.value.error) {
      pendingCommissions = commissionsResult.value.count || 0
    } else {
      console.error('Failed to fetch pending commissions:', commissionsResult.status === 'rejected' ? commissionsResult.reason : commissionsResult.value.error)
    }
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error)
    // 继续渲染，显示 0 值而不是崩溃
  }

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">系统监控</h3>
              <p className="text-sm text-muted-foreground mb-4">
                查看系统指标、健康状态和定时任务执行情况
              </p>
              <Link href="/admin/monitoring">
                <Button>
                  <Activity className="h-4 w-4 mr-2" />
                  查看监控面板
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">平台服务费管理</h3>
              <p className="text-sm text-muted-foreground mb-4">
                向用户收取平台服务费，查看收费记录
              </p>
              <Link href="/admin/platform-fees">
                <Button>
                  <DollarSign className="h-4 w-4 mr-2" />
                  管理服务费
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">违规扣款管理</h3>
              <p className="text-sm text-muted-foreground mb-4">
                从卖家保证金中扣除违规罚款
              </p>
              <Link href="/admin/violation-penalties">
                <Button>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  管理扣款
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">平台支付账户管理</h3>
              <p className="text-sm text-muted-foreground mb-4">
                管理平台用于接收订阅费用的支付账户配置（Stripe、PayPal、支付宝、微信支付）
              </p>
              <Link href="/admin/platform-payment-accounts">
                <Button variant="outline">
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
