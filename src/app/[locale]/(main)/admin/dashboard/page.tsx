import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ContentReview } from '@/components/admin/ContentReview'
import { ReportManagement } from '@/components/admin/ReportManagement'
import { CommissionManagement } from '@/components/admin/CommissionManagement'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { CreditCard, Activity, DollarSign, AlertTriangle, UserMinus } from 'lucide-react'

export default async function AdminDashboard() {
  const t = await getTranslations('admin')
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
  let pendingComments = 0
  let pendingProductComments = 0
  let pendingReports = 0
  let pendingCommissions = 0
  let pendingProfiles = 0
  let postCountsByType: { post_type: string; post_count: number }[] = []

  try {
    const [postsResult, productsResult, commentsResult, productCommentsResult, reportsResult, commissionsResult, profilesResult] = await Promise.allSettled([
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('product_comments')
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
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('profile_status', 'pending'),
    ])

    if (postsResult.status === 'fulfilled' && !postsResult.value.error) {
      pendingPosts = postsResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending posts:', postsResult.status === 'rejected' ? postsResult.reason : postsResult.value?.error)
    }

    if (productsResult.status === 'fulfilled' && !productsResult.value.error) {
      pendingProducts = productsResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending products:', productsResult.status === 'rejected' ? productsResult.reason : productsResult.value?.error)
    }

    if (commentsResult.status === 'fulfilled' && !commentsResult.value.error) {
      pendingComments = commentsResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending comments:', commentsResult.status === 'rejected' ? commentsResult.reason : commentsResult.value?.error)
    }

    if (productCommentsResult.status === 'fulfilled' && !productCommentsResult.value.error) {
      pendingProductComments = productCommentsResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending product comments:', productCommentsResult.status === 'rejected' ? productCommentsResult.reason : productCommentsResult.value?.error)
    }

    if (reportsResult.status === 'fulfilled' && !reportsResult.value.error) {
      pendingReports = reportsResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending reports:', reportsResult.status === 'rejected' ? reportsResult.reason : reportsResult.value?.error)
    }

    if (commissionsResult.status === 'fulfilled' && !commissionsResult.value.error) {
      pendingCommissions = commissionsResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending commissions:', commissionsResult.status === 'rejected' ? commissionsResult.reason : commissionsResult.value?.error)
    }

    if (profilesResult.status === 'fulfilled' && !profilesResult.value.error) {
      pendingProfiles = profilesResult.value.count || 0
    } else if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch pending profiles:', profilesResult.status === 'rejected' ? profilesResult.reason : profilesResult.value?.error)
    }

    const countsResult = await supabase.rpc('get_post_counts_by_type')
    if (!countsResult.error && countsResult.data?.length) {
      postCountsByType = (countsResult.data as { post_type: string; post_count: number }[]).map((r) => ({
        post_type: r.post_type || 'normal',
        post_count: Number(r.post_count) || 0,
      }))
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching admin dashboard stats:', error)
    }
    // 继续渲染，显示 0 值而不是崩溃
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('dashboardTitle')}</h1>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingPostsLabel')}</p>
          <p className="text-2xl font-bold">{pendingPosts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingProductsLabel')}</p>
          <p className="text-2xl font-bold">{pendingProducts || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingCommentsLabel')}</p>
          <p className="text-2xl font-bold">{pendingComments || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingProductCommentsLabel')}</p>
          <p className="text-2xl font-bold">{pendingProductComments || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingReportsLabel')}</p>
          <p className="text-2xl font-bold">{pendingReports || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingCommissionsLabel')}</p>
          <p className="text-2xl font-bold">{pendingCommissions || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('pendingProfilesLabel')}</p>
          <p className="text-2xl font-bold">{pendingProfiles || 0}</p>
        </Card>
      </div>

      {postCountsByType.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-3">{t('contentTypeStats')}</h3>
          <div className="flex flex-wrap gap-4">
            {postCountsByType.map(({ post_type, post_count }) => (
              <div key={post_type} className="rounded-lg border bg-muted/30 px-4 py-2">
                <span className="text-sm text-muted-foreground">
                  {post_type === 'normal' && t('postTypeNormal')}
                  {post_type === 'series' && t('postTypeSeries')}
                  {post_type === 'affiliate' && t('postTypeAffiliate')}
                  {post_type === 'text' && t('postTypeText')}
                  {post_type === 'image' && t('postTypeImage')}
                  {post_type === 'story' && t('postTypeStory')}
                  {post_type === 'music' && t('postTypeMusic')}
                  {post_type === 'short_video' && t('postTypeShortVideo')}
                  {!['normal', 'series', 'affiliate', 'text', 'image', 'story', 'music', 'short_video'].includes(post_type) && post_type}
                </span>
                <span className="ml-2 font-semibold">{post_count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('monitoringTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('monitoringPanelDesc')}
              </p>
              <Link href="/admin/monitoring">
                <Button>
                  <Activity className="h-4 w-4 mr-2" />
                  {t('viewMonitoringPanel')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('platformFeesCard')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('platformFeesCardDesc')}
              </p>
              <Link href="/admin/platform-fees">
                <Button>
                  <DollarSign className="h-4 w-4 mr-2" />
                  {t('manageFees')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('violationPenaltiesCard')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('violationPenaltiesCardDesc')}
              </p>
              <Link href="/admin/violation-penalties">
                <Button>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {t('managePenalties')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('platformPaymentAccountsCard')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('platformPaymentAccountsCardDesc')}
              </p>
              <Link href="/admin/platform-payment-accounts">
                <Button variant="outline">
                  <CreditCard className="h-4 w-4 mr-2" />
                  {t('managePlatformAccounts')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('userPaymentAccountsCard')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('userPaymentAccountsCardDesc')}
              </p>
              <Link href="/admin/payment-accounts">
                <Button variant="outline">
                  {t('viewPaymentAccounts')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('deletionRequestsCard')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('deletionRequestsCardDesc')}
              </p>
              <Link href="/admin/deletion-requests">
                <Button variant="outline">
                  <UserMinus className="h-4 w-4 mr-2" />
                  {t('deletionRequestsLink')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {pendingProfiles > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('pendingProfilesSection')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('pendingProfilesCardDesc', { count: pendingProfiles })}
              </p>
              <Link href="/admin/profile-review">
                <Button variant="outline">
                  {t('goReview')}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Content Review */}
      <ContentReview />

      {/* Report Management - 传入 admin 以便查看并处理所有待处理举报 */}
      <ReportManagement userRole={profile.role} />

      {/* Commission Management */}
      <CommissionManagement />
    </div>
  )
}
