import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ContentReview } from '@/components/admin/ContentReview'
import { ReportManagement } from '@/components/admin/ReportManagement'
import { CommissionManagement } from '@/components/admin/CommissionManagement'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import NextLink from 'next/link'
import { Link } from '@/i18n/navigation'
import { CreditCard, Activity, DollarSign, AlertTriangle, Users, Headphones } from 'lucide-react'

interface AdminDashboardProps {
  params: Promise<{ locale: string }>
}

export default async function AdminDashboard({ params }: AdminDashboardProps) {
  const { locale } = await params
  const supabase = await createClient()
  const t = await getTranslations({ locale, namespace: 'admin' })
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
  let pendingTickets = 0

  try {
    const [postsResult, productsResult, reportsResult, commissionsResult, ticketsResult] = await Promise.allSettled([
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
      supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open'),
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

    if (ticketsResult.status === 'fulfilled' && !ticketsResult.value.error) {
      pendingTickets = ticketsResult.value.count || 0
    } else {
      console.error('Failed to fetch pending tickets:', ticketsResult.status === 'rejected' ? ticketsResult.reason : ticketsResult.value.error)
    }
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error)
    // 继续渲染，显示 0 值而不是崩溃
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('dashboardTitle')}</h1>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingPosts')}</p>
          <p className="text-2xl font-bold">{pendingPosts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingProducts')}</p>
          <p className="text-2xl font-bold">{pendingProducts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingReports')}</p>
          <p className="text-2xl font-bold">{pendingReports || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingCommissions')}</p>
          <p className="text-2xl font-bold">{pendingCommissions || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingTickets') || '待处理工单'}</p>
          <p className="text-2xl font-bold">{pendingTickets || 0}</p>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('supportTicketsTitle') || '客服工单'}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('supportTicketsDescription') || '处理用户提交的客服工单和申请'}
              </p>
              <Link href="/admin/support">
                <Button>
                  <Headphones className="h-4 w-4 mr-2" />
                  {t('supportTicketsButton') || '查看工单'}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('monitoringTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('monitoringDescription')}
              </p>
              <Link href="/admin/monitoring">
                <Button>
                  <Activity className="h-4 w-4 mr-2" />
                  {t('monitoringButton')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('platformFeesTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('platformFeesDescription')}
              </p>
              <Link href="/admin/platform-fees">
                <Button>
                  <DollarSign className="h-4 w-4 mr-2" />
                  {t('platformFeesButton')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('violationPenaltiesTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('violationPenaltiesDescription')}
              </p>
              <Link href="/admin/violation-penalties">
                <Button>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {t('violationPenaltiesButton')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('platformPaymentAccountsTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('platformPaymentAccountsDescription')}
              </p>
              <Link href="/admin/platform-payment-accounts">
                <Button variant="outline">
                  <CreditCard className="h-4 w-4 mr-2" />
                  {t('platformPaymentAccountsButton')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('userPaymentAccountsTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('userPaymentAccountsDescription')}
              </p>
              <Link href="/admin/payment-accounts">
                <Button variant="outline">
                  {t('userPaymentAccountsButton')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('internalUsersTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('internalUsersDescription')}
              </p>
              <NextLink href={`/${locale}/admin/internal-users`}>
                <Button variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  {t('internalUsersButton')}
                </Button>
              </NextLink>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('subscriptionsTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('subscriptionsDescription')}
              </p>
              <Link href="/admin/subscriptions">
                <Button variant="outline">
                  <CreditCard className="h-4 w-4 mr-2" />
                  {t('subscriptionsButton')}
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
