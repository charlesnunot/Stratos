'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useToast } from '@/lib/hooks/useToast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { ArrowLeft } from 'lucide-react'

interface AdminDisputeClientProps {
  disputeId: string
  initialDispute: any
  initialOrder: any
}

export function AdminDisputeClient({
  disputeId,
  initialDispute,
  initialOrder,
}: AdminDisputeClientProps) {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const { toast } = useToast()
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState('')
  const [refundAmount, setRefundAmount] = useState(
    initialOrder?.total_amount?.toString() || ''
  )
  const [refundMethod, setRefundMethod] = useState<'original_payment' | 'platform_refund'>(
    'platform_refund'
  )

  const handleResolve = async () => {
    if (!resolution.trim()) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('enterResolution'),
      })
      return
    }

    setResolving(true)
    try {
      const response = await fetch('/api/admin/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId,
          resolution,
          refundAmount: refundAmount ? parseFloat(refundAmount) : null,
          refundMethod,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t('disputeResolveFailed'))
      }

      toast({
        variant: 'success',
        title: tCommon('success'),
        description: t('disputeResolved'),
      })

      router.push('/admin/orders')
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: (error as Error)?.message || t('disputeResolveFailed'),
      })
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {tCommon('back')}
        </Button>
        <h1 className="text-3xl font-bold">{t('resolveDispute')}</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('orderInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="font-semibold">{t('orderNumber')}:</span> {initialOrder.order_number}
            </p>
            <p>
              <span className="font-semibold">{t('orderAmount')}:</span>{' '}
              {formatCurrency(
                initialOrder.total_amount,
                (initialOrder.currency as Currency) || 'USD'
              )}
            </p>
            <p>
              <span className="font-semibold">{t('buyer')}:</span>{' '}
              {initialOrder.buyer?.display_name || initialOrder.buyer?.username || 'Unknown'}
            </p>
            <p>
              <span className="font-semibold">{t('sellerLabel')}:</span>{' '}
              {initialOrder.seller?.display_name || initialOrder.seller?.username || 'Unknown'}
            </p>
            <p>
              <span className="font-semibold">{t('paymentStatus')}:</span>{' '}
              <Badge>{initialOrder.payment_status}</Badge>
            </p>
            <p>
              <span className="font-semibold">{t('orderStatus')}:</span>{' '}
              <Badge>{initialOrder.order_status}</Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('disputeInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="font-semibold">{t('disputeType')}:</span>{' '}
              <Badge variant="outline">{initialDispute.dispute_type}</Badge>
            </p>
            <p>
              <span className="font-semibold">{t('disputeStatus')}:</span>{' '}
              <Badge
                variant={initialDispute.status === 'pending' ? 'destructive' : 'secondary'}
              >
                {initialDispute.status}
              </Badge>
            </p>
            <p>
              <span className="font-semibold">{t('initiatedBy')}:</span> {initialDispute.initiated_by_type}
            </p>
            <p>
              <span className="font-semibold">{t('reason')}:</span> {initialDispute.reason}
            </p>
            {initialDispute.seller_response && (
              <p>
                <span className="font-semibold">{t('sellerResponse')}:</span> {initialDispute.seller_response}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {initialDispute.evidence && initialDispute.evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('evidence')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              {(initialDispute.evidence as string[]).map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Evidence ${index + 1}`}
                  className="rounded-md border"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('resolutionDecision')}</CardTitle>
          <CardDescription>{t('resolutionDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="resolution">{t('resolutionDecision')} *</Label>
            <Textarea
              id="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder={t('resolutionPlaceholder')}
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="refundAmount">{t('refundAmountLabel')}</Label>
            <Input
              id="refundAmount"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
            />
          </div>

          <div>
            <Label htmlFor="refundMethod">{t('refundMethod')}</Label>
            <select
              id="refundMethod"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="original_payment">{t('originalPayment')}</option>
              <option value="platform_refund">{t('platformRefund')}</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleResolve} disabled={resolving || !resolution.trim()}>
              {resolving ? t('processingResolve') : t('confirmResolve')}
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              {tCommon('cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
