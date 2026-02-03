'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { ArrowLeft } from 'lucide-react'

interface Debt {
  id: string
  debt_amount: number
  currency: string
  debt_reason: string
  status: string
  collection_method: string | null
  collected_at: string | null
  created_at: string
  order?: { id: string; order_number: string; total_amount: number; currency: string }
  dispute?: { id: string; dispute_type: string; status: string }
  refund?: { id: string; refund_amount: number; currency: string }
}

interface DepositLot {
  id: string
  required_amount: number
  currency: string
  status: string
  held_at: string | null
  metadata: unknown
}

export function SellerDebtDetailsClient({ sellerId }: { sellerId: string }) {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [seller, setSeller] = useState<{ display_name?: string; username?: string } | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [statistics, setStatistics] = useState({
    totalDebt: 0,
    totalCollected: 0,
    totalPaid: 0,
    pendingDebtCount: 0,
    collectedDebtCount: 0,
    depositBalance: 0,
    depositLotsCount: 0,
  })
  const [depositLots, setDepositLots] = useState<DepositLot[]>([])

  useEffect(() => {
    if (sellerId) loadData()
  }, [sellerId])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/seller-debts/${sellerId}`)
      const data = await res.json()
      if (data.seller) setSeller(data.seller)
      if (data.debts) setDebts(data.debts)
      if (data.statistics) setStatistics(data.statistics)
      if (data.depositLots) setDepositLots(data.depositLots)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }

  const handleCollectFromDeposit = async () => {
    if (!confirm(t('confirmCollectFromDeposit'))) return
    try {
      const res = await fetch('/api/admin/seller-debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collect_from_deposit', sellerId }),
      })
      const data = await res.json()
      if (data.success) {
        alert(t('debtCollected', { amount: data.totalCollected }))
        loadData()
      } else alert(`${t('collectFailed')}: ${data.error}`)
    } catch {
      alert(t('collectFailed'))
    }
  }

  const getStatusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'destructive', collected: 'default', paid: 'default', forgiven: 'secondary',
    }
    const l: Record<string, string> = {
      pending: t('debtStatusPending'), collected: t('debtStatusCollected'), paid: t('debtStatusPaid'), forgiven: t('debtStatusForgiven'),
    }
    return <Badge variant={v[status] || 'outline'}>{l[status] || status}</Badge>
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="mt-4 text-muted-foreground">{tCommon('loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />{tCommon('back')}
        </Button>
        <div>
          <h1 className="text-3xl font-bold">
            {t('debtDetailsTitle')}: {seller?.display_name || seller?.username || sellerId}
          </h1>
          <p className="mt-2 text-muted-foreground">{t('debtDetailsSubtitle')}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t('pendingDebtDesc')}</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(statistics.totalDebt, 'USD')}</div>
            <p className="text-xs text-muted-foreground">{t('pendingDebtCountLabel', { count: statistics.pendingDebtCount })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t('collectedDebtDesc')}</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statistics.totalCollected, 'USD')}</div>
            <p className="text-xs text-muted-foreground">{t('collectedDebtCountLabel', { count: statistics.collectedDebtCount })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t('depositBalance')}</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statistics.depositBalance, 'USD')}</div>
            <p className="text-xs text-muted-foreground">{t('depositLotsCountLabel', { count: statistics.depositLotsCount })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t('action')}</CardDescription></CardHeader>
          <CardContent>
            <Button
              variant="default"
              size="sm"
              onClick={handleCollectFromDeposit}
              disabled={statistics.totalDebt === 0 || statistics.depositBalance === 0}
            >
              {t('collectFromDeposit')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {depositLots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('depositLotsTitle')}</CardTitle>
            <CardDescription>{t('depositLotsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {depositLots.map((lot) => (
              <div key={lot.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{formatCurrency(lot.required_amount, (lot.currency as Currency) || 'USD')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('statusLabel')}: {lot.status} | {t('heldAtLabel')}: {lot.held_at ? new Date(lot.held_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('debtHistoryTitle')}</CardTitle>
          <CardDescription>{t('debtHistoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {debts.map((debt) => (
            <Card key={debt.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">
                        {formatCurrency(debt.debt_amount, (debt.currency as Currency) || 'USD')}
                      </span>
                      {getStatusBadge(debt.status)}
                      {debt.collection_method && <Badge variant="outline">{debt.collection_method}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{t('reason')}: {debt.debt_reason}</p>
                    {debt.order && <p className="text-sm text-muted-foreground">{t('orderLabel')}: {debt.order.order_number}</p>}
                    <p className="text-sm text-muted-foreground">{t('createdAtLabel')}: {new Date(debt.created_at).toLocaleString()}</p>
                    {debt.collected_at && (
                      <p className="text-sm text-muted-foreground">{t('deductedAt')}: {new Date(debt.collected_at).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {debts.length === 0 && <p className="py-8 text-center text-muted-foreground">{t('noDebtRecords')}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
