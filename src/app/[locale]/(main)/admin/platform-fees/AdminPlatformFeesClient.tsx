/**
 * Admin platform fees management – client UI.
 * Auth enforced by Server Component wrapper.
 */

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
import { DollarSign, Search, CheckCircle, XCircle, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

interface PlatformFeeTransaction {
  id: string
  related_id: string
  amount: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
  metadata: {
    type: string
    reason: string
    charged_by: string
    charged_at: string
  }
  user?: {
    id: string
    display_name: string
    username: string
  }
}

export function AdminPlatformFeesClient() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<PlatformFeeTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(true)
  const [searchUserId, setSearchUserId] = useState('')

  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [reason, setReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadTransactions()
  }, [])

  const loadTransactions = async () => {
    setLoadingTransactions(true)
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          id,
          related_id,
          amount,
          currency,
          status,
          paid_at,
          created_at,
          metadata
        `)
        .contains('metadata', { type: 'platform_fee' })
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      const transactionsWithUsers = await Promise.all(
        (data || []).map(async (tx) => {
          const { data: userData } = await supabase
            .from('profiles')
            .select('id, display_name, username')
            .eq('id', tx.related_id)
            .single()

          return {
            ...tx,
            user: userData || undefined,
          }
        })
      )

      setTransactions(transactionsWithUsers as PlatformFeeTransaction[])
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'message' in err) {
        console.error('Error loading transactions:', err)
      }
    } finally {
      setLoadingTransactions(false)
    }
  }

  const handleCharge = async () => {
    if (!userId || !amount || !reason || !paymentMethod) {
      alert(t('fillRequiredFields'))
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/platform-fees/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          currency,
          reason,
          paymentMethod,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to charge platform fee')
      }

      if (result.requiresManualProcessing) {
        alert(result.message || t('bankTransferManual'))
        setShowForm(false)
        loadTransactions()
        return
      }

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl
      } else if (result.formAction && result.formData) {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = result.formAction
        Object.entries(result.formData).forEach(([key, value]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = key
          input.value = value as string
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
      } else if (result.codeUrl) {
        alert(t('wechatQrCreated'))
        setShowForm(false)
        loadTransactions()
      } else {
        alert(t('platformFeeCreated'))
        setShowForm(false)
        loadTransactions()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('platformFeeFailed'))
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />{t('paid')}</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="h-3 w-3 mr-1" />{t('pendingPayment')}</Badge>
      case 'failed':
        return <Badge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" />{t('statusFailed')}</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const filteredTransactions = transactions.filter((tx) => {
    if (!searchUserId) return true
    return (
      tx.related_id.toLowerCase().includes(searchUserId.toLowerCase()) ||
      tx.user?.display_name?.toLowerCase().includes(searchUserId.toLowerCase()) ||
      tx.user?.username?.toLowerCase().includes(searchUserId.toLowerCase())
    )
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('platformFeesTitle')}</h1>
          <p className="mt-1 text-muted-foreground">{t('platformFeesSubtitle')}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <DollarSign className="mr-2 h-4 w-4" />
          {showForm ? tCommon('cancel') : t('chargeServiceFee')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('chargePlatformFee')}</CardTitle>
            <CardDescription>{t('chargePlatformFeeDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="userId">{t('userIdLabel')}</Label>
                <Input
                  id="userId"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder={t('enterUserId')}
                />
              </div>
              <div>
                <Label htmlFor="amount">{t('amountLabel')} *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="currency">币种</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="paymentMethod">支付方式 *</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="alipay">{t('providerAlipay')}</SelectItem>
                    <SelectItem value="wechat">{t('providerWechat')}</SelectItem>
                    <SelectItem value="bank">{t('providerBank')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="reason">{t('reason')} *</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('enterReason')}
              />
            </div>
            <Button onClick={handleCharge} disabled={loading} className="w-full">
              {loading ? tCommon('processing') : t('createPayment')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('feeRecords')}</CardTitle>
          <CardDescription>{t('feeRecordsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchUserIdPlaceholder')}
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {loadingTransactions ? (
            <div className="py-8 text-center text-muted-foreground">{tCommon('loading')}</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t('noRecords')}</div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {tx.user?.display_name || tx.user?.username || tx.related_id}
                      </p>
                      <p className="text-sm text-muted-foreground">{tx.metadata?.reason || t('platformServiceFee')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatCurrency(tx.amount, tx.currency as Currency)}</p>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t('createdAtLabel')}: {new Date(tx.created_at).toLocaleString()}</span>
                    {tx.paid_at && (
                      <span>{t('paidAt')}: {new Date(tx.paid_at).toLocaleString()}</span>
                    )}
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
