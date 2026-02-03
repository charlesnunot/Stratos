'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Search, CheckCircle, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

interface ViolationRecord {
  id: string
  seller_id: string
  violation_type: string
  violation_reason: string
  penalty_amount: number
  currency: string
  status: string
  deducted_at: string | null
  created_at: string
  seller?: { id: string; display_name: string; username: string }
}

export function AdminViolationPenaltiesClient() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const tSeller = useTranslations('seller')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [violations, setViolations] = useState<ViolationRecord[]>([])
  const [loadingViolations, setLoadingViolations] = useState(true)
  const [searchSellerId, setSearchSellerId] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('CNY')
  const [violationType, setViolationType] = useState('')
  const [violationReason, setViolationReason] = useState('')
  const [relatedOrderId, setRelatedOrderId] = useState('')
  const [relatedDisputeId, setRelatedDisputeId] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadViolations()
  }, [])

  const loadViolations = async () => {
    setLoadingViolations(true)
    try {
      const { data, error } = await supabase
        .from('seller_violations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        const { data: depositData } = await supabase
          .from('seller_deposit_lots')
          .select('id, seller_id, metadata, created_at')
          .contains('metadata', { deduction_reason: '违规扣款' })
          .order('created_at', { ascending: false })
          .limit(100)

        if (depositData) {
          const mapped = depositData.map((lot: any) => ({
            id: lot.id,
            seller_id: lot.seller_id,
            violation_type: lot.metadata?.violation_type || 'unknown',
            violation_reason: lot.metadata?.deduction_reason || '违规扣款',
            penalty_amount: lot.metadata?.deduction_amount || 0,
            currency: lot.metadata?.currency || 'CNY',
            status: 'completed',
            deducted_at: lot.metadata?.deducted_at || null,
            created_at: lot.created_at,
          }))
          setViolations(mapped as ViolationRecord[])
        }
        return
      }

      const withSellers = await Promise.all(
        (data || []).map(async (v) => {
          const { data: s } = await supabase
            .from('profiles')
            .select('id, display_name, username')
            .eq('id', v.seller_id)
            .single()
          return { ...v, seller: s || undefined }
        })
      )
      setViolations(withSellers as ViolationRecord[])
    } catch {
      /* noop */
    } finally {
      setLoadingViolations(false)
    }
  }

  const handleDeduct = async () => {
    if (!sellerId || !amount || !violationType || !violationReason) {
      alert(t('fillRequiredFields'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/violation-penalties/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          amount: parseFloat(amount),
          currency,
          violationType,
          violationReason,
          relatedOrderId: relatedOrderId || undefined,
          relatedDisputeId: relatedDisputeId || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || t('penaltyFailed'))
      if (result.success) {
        alert(t('penaltySuccess', {
          amount: formatCurrency(result.deductedAmount, result.deductedAmountCurrency),
          remaining: formatCurrency(result.remainingBalance, result.deductedAmountCurrency),
        }))
        setShowForm(false)
        setSellerId('')
        setAmount('')
        setViolationType('')
        setViolationReason('')
        setRelatedOrderId('')
        setRelatedDisputeId('')
        loadViolations()
      } else throw new Error(result.error || t('penaltyFailed'))
    } catch (e: any) {
      alert(e?.message || t('penaltyFailed'))
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />{t('statusCompleted')}</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500">{t('statusPending')}</Badge>
      case 'failed':
        return <Badge className="bg-red-500"><XCircle className="mr-1 h-3 w-3" />{t('statusFailed')}</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const filtered = violations.filter((v) => {
    if (!searchSellerId) return true
    return (
      v.seller_id.toLowerCase().includes(searchSellerId.toLowerCase()) ||
      v.seller?.display_name?.toLowerCase().includes(searchSellerId.toLowerCase()) ||
      v.seller?.username?.toLowerCase().includes(searchSellerId.toLowerCase())
    )
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('penaltyTitle')}</h1>
          <p className="mt-1 text-muted-foreground">{t('penaltySubtitle')}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          {showForm ? tCommon('cancel') : t('executeDeduct')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('executeDeduct')}</CardTitle>
            <CardDescription>{t('penaltySubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="sellerId">{t('sellerIdLabel')}</Label>
                <Input id="sellerId" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder={t('sellerIdPlaceholder')} />
              </div>
              <div>
                <Label htmlFor="amount">{t('amountLabel')}</Label>
                <Input id="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label htmlFor="currency">{tSeller('currency')}</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="violationType">{t('violationTypeLabel')}</Label>
                <Select value={violationType} onValueChange={setViolationType}>
                  <SelectTrigger><SelectValue placeholder={t('violationTypePlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fraud">{t('violationTypeFraud')}</SelectItem>
                    <SelectItem value="quality">{t('violationTypeQuality')}</SelectItem>
                    <SelectItem value="shipping">{t('violationTypeShipping')}</SelectItem>
                    <SelectItem value="service">{t('violationTypeService')}</SelectItem>
                    <SelectItem value="policy">{t('violationTypePolicy')}</SelectItem>
                    <SelectItem value="other">{t('violationTypeOther')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="relatedOrderId">{t('relatedOrderIdLabel')}</Label>
                <Input id="relatedOrderId" value={relatedOrderId} onChange={(e) => setRelatedOrderId(e.target.value)} placeholder={t('relatedOrderIdPlaceholder')} />
              </div>
              <div>
                <Label htmlFor="relatedDisputeId">{t('relatedDisputeIdLabel')}</Label>
                <Input id="relatedDisputeId" value={relatedDisputeId} onChange={(e) => setRelatedDisputeId(e.target.value)} placeholder={t('relatedDisputeIdPlaceholder')} />
              </div>
            </div>
            <div>
              <Label htmlFor="violationReason">{t('violationReasonLabel')}</Label>
              <Input id="violationReason" value={violationReason} onChange={(e) => setViolationReason(e.target.value)} placeholder={t('violationReasonPlaceholder')} />
            </div>
            <Button onClick={handleDeduct} disabled={loading} className="w-full">
              {loading ? t('processingDeduct') : t('executeDeduct')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('deductRecord')}</CardTitle>
          <CardDescription>{t('deductRecordDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('searchSellerPlaceholder')} value={searchSellerId} onChange={(e) => setSearchSellerId(e.target.value)} className="pl-8" />
            </div>
          </div>
          {loadingViolations ? (
            <div className="py-8 text-center text-muted-foreground">{tCommon('loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t('noRecords')}</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((v) => (
                <div key={v.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{v.seller?.display_name || v.seller?.username || v.seller_id}</p>
                      <p className="text-sm text-muted-foreground">{v.violation_type} - {v.violation_reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">-{formatCurrency(v.penalty_amount, v.currency as Currency)}</p>
                      {getStatusBadge(v.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t('createdAt')}: {new Date(v.created_at).toLocaleString()}</span>
                    {v.deducted_at && <span>{t('deductedAt')}: {new Date(v.deducted_at).toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
