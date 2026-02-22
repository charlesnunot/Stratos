'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/currency/format-currency'
import { Search, Calendar, CreditCard, User, Filter } from 'lucide-react'
import { Link } from '@/i18n/navigation'

interface Subscription {
  id: string
  user_id: string
  subscription_type: string
  subscription_tier: string | number | null
  status: string
  amount: string | number
  currency: string
  payment_method: string
  payment_account_id: string | null
  starts_at: string
  expires_at: string
  created_at: string
  profiles?: {
    id: string
    username: string
    display_name: string
    role: string
    seller_type: string | null
  }
}

interface AdminSubscriptionsClientProps {
  initialSubscriptions?: Subscription[]
}

export function AdminSubscriptionsClient({ initialSubscriptions = [] }: AdminSubscriptionsClientProps) {
  const t = useTranslations('admin')
  const params = useParams()
  const locale = (params as any)?.locale as string | undefined
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions)
  const [loading, setLoading] = useState(initialSubscriptions.length === 0)
  const [activeTab, setActiveTab] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    if (initialSubscriptions.length > 0) return

    const loadSubscriptions = async () => {
      try {
        const res = await fetch('/api/admin/subscriptions')
        const data = await res.json()

        console.log('API response status:', res.status)
        console.log('API response data:', data)
        console.log('Is array?', Array.isArray(data))
        console.log('Data length:', Array.isArray(data) ? data.length : 'N/A')

        if (!res.ok) {
          console.error('Error loading subscriptions:', data.error)
        } else {
          setSubscriptions(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error('Error loading subscriptions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSubscriptions()
  }, [initialSubscriptions.length])

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      pending: 'secondary',
      cancelled: 'outline',
      expired: 'destructive',
    }
    const labels: Record<string, string> = {
      active: 'Active',
      pending: 'Pending',
      cancelled: 'Cancelled',
      expired: 'Expired',
    }
    return <Badge variant={variants[status] || 'secondary'}>{labels[status] || status}</Badge>
  }

  const getSubscriptionTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      seller: 'default',
      affiliate: 'secondary',
      tip: 'outline',
    }
    const labels: Record<string, string> = {
      seller: 'Seller',
      affiliate: 'Affiliate',
      tip: 'Tip',
    }
    return <Badge variant={variants[type] || 'secondary'}>{labels[type] || type}</Badge>
  }

  const getTierBadge = (tier: string | number | null) => {
    const tierNum = typeof tier === 'string' ? parseFloat(tier) : tier
    if (tierNum === null || tierNum === 0) return <Badge variant="outline">Free</Badge>
    if (tierNum === 50) return <Badge variant="secondary">Growth ($50)</Badge>
    if (tierNum === 100) return <Badge variant="default">Scale ($100)</Badge>
    return <Badge variant="outline">{tier}</Badge>
  }

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch = 
      sub.profiles?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.profiles?.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.payment_account_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTab = activeTab === 'all' || sub.subscription_type === activeTab
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter

    return matchesSearch && matchesTab && matchesStatus
  })

  const activeCount = subscriptions.filter(s => s.status === 'active').length
  const pendingCount = subscriptions.filter(s => s.status === 'pending').length
  const cancelledCount = subscriptions.filter(s => s.status === 'cancelled').length
  const expiredCount = subscriptions.filter(s => s.status === 'expired').length

  const sellerCount = subscriptions.filter(s => s.subscription_type === 'seller').length
  const affiliateCount = subscriptions.filter(s => s.subscription_type === 'affiliate').length
  const tipCount = subscriptions.filter(s => s.subscription_type === 'tip').length

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t('subscriptionsTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('subscriptionsSubtitle')}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading subscriptions...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Cancelled</p>
            <p className="text-2xl font-bold">{cancelledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Expired</p>
            <p className="text-2xl font-bold">{expiredCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Seller</p>
            <p className="text-2xl font-bold">{sellerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Affiliate</p>
            <p className="text-2xl font-bold">{affiliateCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tip</p>
            <p className="text-2xl font-bold">{tipCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Subscriptions</CardTitle>
          <CardDescription>View and manage all user subscriptions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by username or transaction ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({subscriptions.length})</TabsTrigger>
              <TabsTrigger value="seller">Seller ({sellerCount})</TabsTrigger>
              <TabsTrigger value="affiliate">Affiliate ({affiliateCount})</TabsTrigger>
              <TabsTrigger value="tip">Tip ({tipCount})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4 space-y-4">
              {filteredSubscriptions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No subscriptions found matching your criteria.
                </div>
              ) : (
                filteredSubscriptions.map((sub) => (
                  <Card key={sub.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            {getSubscriptionTypeBadge(sub.subscription_type)}
                            {getStatusBadge(sub.status)}
                            {sub.subscription_type === 'seller' && getTierBadge(sub.subscription_tier)}
                          </div>
                          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span className="font-medium">
                              {sub.profiles?.username || sub.profiles?.display_name || 'Unknown'}
                            </span>
                            {sub.profiles?.seller_type === 'direct' && (
                              <Badge variant="outline" className="text-xs">Direct Seller</Badge>
                            )}
                          </div>
                          <div className="mb-2 flex items-center gap-2 text-sm">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {formatCurrency(typeof sub.amount === 'string' ? parseFloat(sub.amount) : sub.amount, sub.currency as any)}
                            </span>
                            <span className="text-muted-foreground">via {sub.payment_method}</span>
                            {sub.payment_account_id && (
                              <span className="text-xs text-muted-foreground">
                                ({sub.payment_account_id})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>Started: {new Date(sub.starts_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>Expires: {new Date(sub.expires_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/admin/profiles/${sub.user_id}`}>
                            <Button variant="outline" size="sm">
                              View Profile
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  )
}
