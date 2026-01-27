'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  ArrowLeft,
  RefreshCw,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  Info,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

type LotStatus = 'refundable' | 'refunding' | 'refunded'

interface DepositLot {
  id: string
  required_amount: number
  currency: string
  status: string
  refundable_at: string | null
  held_at: string | null
  refunded_amount: number | null
  refund_fee_amount: number | null
  required_at: string
  updated_at: string
}

export default function DepositRefundPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const t = useTranslations('deposit')
  const [requestingLotId, setRequestingLotId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  const { data: lots, isLoading, refetch } = useQuery({
    queryKey: ['depositRefundLots', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('seller_deposit_lots')
        .select('id, required_amount, currency, status, refundable_at, held_at, refunded_amount, refund_fee_amount, required_at, updated_at')
        .eq('seller_id', user.id)
        .in('status', ['refundable', 'refunding', 'refunded'])
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as DepositLot[]
    },
    enabled: !!user,
  })

  const canRequestRefund = (lot: DepositLot) => {
    if (lot.status !== 'refundable') return false
    if (!lot.refundable_at) return true
    return new Date(lot.refundable_at) <= new Date()
  }

  const handleRequestRefund = async (lotId: string) => {
    setRequestingLotId(lotId)
    try {
      const res = await fetch(`/api/deposits/${lotId}/request-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Failed to request refund')
      }
      toast({
        title: t('refund.requestSuccess') || '申请已提交',
        description: t('refund.requestSuccessDesc') || '保证金退款申请已提交，我们将在 3–5 个工作日内处理。',
      })
      queryClient.invalidateQueries({ queryKey: ['depositRefundLots', user?.id] })
      refetch()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      toast({
        variant: 'destructive',
        title: t('refund.requestError') || '申请失败',
        description: msg,
      })
    } finally {
      setRequestingLotId(null)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">
          {t('refund.title') || '保证金退款'}
        </h1>
      </div>

      <Card className="border-muted bg-muted/30 p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              {t('refund.intro') ||
                '当未完成订单总额降至订阅档位以下且相关订单均已完成后，保证金将变为可退款。您可在此查看可退款、退款中、已退款的保证金记录并申请退款。'}
            </p>
            <Link
              href="/seller/deposit/policy"
              className="inline-flex items-center gap-1 text-primary underline hover:no-underline"
            >
              {t('refund.viewPolicy') || '查看保证金政策'}
            </Link>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t('refund.lotsTitle') || '保证金记录'}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('refund.refresh') || '刷新'}
        </Button>
      </div>

      {!lots?.length ? (
        <Card className="flex flex-col items-center justify-center gap-4 p-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Wallet className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1 text-center">
            <p className="font-medium">
              {t('refund.emptyTitle') || '暂无退款记录'}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('refund.emptyDesc') ||
                '当前没有可退款、退款中或已退款的保证金。'}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/seller/deposit/policy">
              <Button variant="outline">{t('refund.viewPolicy') || '查看政策'}</Button>
            </Link>
            <Link href="/seller/deposit/pay">
              <Button variant="outline">{t('pay.title') || '支付保证金'}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {lots.map((lot) => (
            <Card key={lot.id} className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl font-semibold">
                      {formatCurrency(
                        Number(lot.required_amount),
                        (lot.currency || 'USD') as Currency
                      )}
                    </span>
                    <StatusBadge status={lot.status as LotStatus} t={t} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      {t('refund.heldAt') || '持有时间'}:{' '}
                      {lot.held_at
                        ? new Date(lot.held_at).toLocaleDateString()
                        : '–'}
                    </span>
                    {lot.refundable_at && (
                      <span>
                        {t('refund.refundableAt') || '可退款时间'}:{' '}
                        {new Date(lot.refundable_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {lot.status === 'refunded' && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {lot.refunded_amount != null && (
                        <span>
                          {t('refund.refundedAmount') || '退款金额'}:{' '}
                          {formatCurrency(
                            Number(lot.refunded_amount),
                            (lot.currency || 'USD') as Currency
                          )}
                        </span>
                      )}
                      {lot.refund_fee_amount != null &&
                        Number(lot.refund_fee_amount) > 0 && (
                          <span className="text-muted-foreground">
                            {t('refund.fee') || '手续费'}:{' '}
                            {formatCurrency(
                              Number(lot.refund_fee_amount),
                              (lot.currency || 'USD') as Currency
                            )}
                          </span>
                        )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {lot.status === 'refundable' && canRequestRefund(lot) && (
                    <Button
                      onClick={() => handleRequestRefund(lot.id)}
                      disabled={!!requestingLotId}
                    >
                      {requestingLotId === lot.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('refund.requesting') || '提交中...'}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {t('refund.apply') || '申请退款'}
                        </>
                      )}
                    </Button>
                  )}
                  {lot.status === 'refundable' && !canRequestRefund(lot) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {t('refund.waitUntil') || '请等待可退款日期后再申请'}
                    </div>
                  )}
                  {lot.status === 'refunding' && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('refund.processing') || '退款处理中'}
                    </div>
                  )}
                  {lot.status === 'refunded' && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {t('refund.completed') || '已退款'}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/seller/deposit/policy" className="flex-1">
          <Button variant="outline" className="w-full">
            {t('refund.viewPolicy') || '查看保证金政策'}
          </Button>
        </Link>
        <Button variant="outline" onClick={() => router.back()} className="flex-1">
          {t('pay.back') || '返回'}
        </Button>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  t,
}: {
  status: LotStatus
  t: (key: string) => string
}) {
  const config = {
    refundable: { variant: 'default' as const, label: t('policy.status.refundable') },
    refunding: { variant: 'secondary' as const, label: t('policy.status.refunding') },
    refunded: { variant: 'outline' as const, label: t('policy.status.refunded') },
  }
  const { variant, label } = config[status] ?? {
    variant: 'outline' as const,
    label: status,
  }
  return <Badge variant={variant}>{label}</Badge>
}
