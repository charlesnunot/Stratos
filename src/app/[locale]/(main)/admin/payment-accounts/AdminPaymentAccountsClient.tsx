/**
 * Admin payment account verification – client UI.
 * Auth enforced by Server Component wrapper.
 */

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/lib/hooks/useToast'
import {
  CreditCard,
  Wallet,
  Smartphone,
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
} from 'lucide-react'

interface PaymentAccount {
  id: string
  seller_id: string
  account_type: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  account_name: string | null
  account_info: any
  currency: string
  is_verified: boolean
  verification_status: 'pending' | 'verified' | 'rejected' | 'expired'
  verification_notes: string | null
  verification_documents: any
  created_at: string
  profiles?: { id: string; username: string; display_name: string }
}

const ACCOUNT_TYPE_INFO: Record<string, { nameKey?: string; name?: string; icon: any }> = {
  stripe: { name: 'Stripe', icon: CreditCard },
  paypal: { name: 'PayPal', icon: Wallet },
  alipay: { nameKey: 'providerAlipay', icon: Smartphone },
  wechat: { nameKey: 'providerWechat', icon: Smartphone },
  bank: { nameKey: 'providerBank', icon: Building2 },
}

export function AdminPaymentAccountsClient() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const supabase = createClient()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select(`*, profiles!payment_accounts_seller_id_fkey(id, username, display_name)`)
        .order('created_at', { ascending: false })
      if (error) throw error
      setAccounts(data || [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('loadPaymentAccountsFailed')
      toast({ variant: 'destructive', title: tCommon('error'), description: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (status: 'verified' | 'rejected') => {
    if (!selectedAccount) return
    setVerifying(true)
    try {
      const res = await fetch(`/api/admin/payment-accounts/${selectedAccount.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes: verificationNotes || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || t('verifyFailed'))
      }
      toast({
        variant: 'success',
        title: tCommon('success'),
        description: status === 'verified' ? t('paymentAccountVerified') : t('paymentAccountRejected'),
      })
      setSelectedAccount(null)
      setVerificationNotes('')
      loadAccounts()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('verifyFailed')
      toast({ variant: 'destructive', title: tCommon('error'), description: msg })
    } finally {
      setVerifying(false)
    }
  }

  const getVerificationBadge = (status: string, isVerified: boolean) => {
    if (isVerified && status === 'verified')
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="mr-1 h-3 w-3" />{t('verified')}
        </Badge>
      )
    if (status === 'pending')
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />{t('pendingVerify')}
        </Badge>
      )
    if (status === 'rejected')
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />{t('rejectedStatus')}
        </Badge>
      )
    return null
  }

  const getAccountTypeName = (type: string) => {
    const Info = ACCOUNT_TYPE_INFO[type]
    if (!Info) return type
    return Info.nameKey ? t(Info.nameKey) : (Info.name ?? type)
  }

  const getAccountDisplayInfo = (account: PaymentAccount) => {
    const info = account.account_info || {}
    switch (account.account_type) {
      case 'stripe':
        return info.stripe?.account_id ? `ID: ${info.stripe.account_id}` : t('notConnected')
      case 'paypal':
        return info.paypal?.email || t('notSet')
      case 'alipay':
        return `${info.alipay?.account || t('notSet')} (${info.alipay?.real_name || ''})`
      case 'wechat':
        return `mch_id: ${info.wechat?.mch_id || t('notSet')}`
      case 'bank':
        return `${info.bank?.bank_name || ''} ${info.bank?.account_number || ''}`.trim() || t('notSet')
      default:
        return t('notSet')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">{tCommon('loading')}</p>
        </div>
      </div>
    )
  }

  const pending = accounts.filter((a) => a.verification_status === 'pending')
  const verified = accounts.filter((a) => a.verification_status === 'verified')
  const rejected = accounts.filter((a) => a.verification_status === 'rejected')

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">支付账户验证</h1>
        <p className="mt-2 text-muted-foreground">管理卖家支付账户的验证状态</p>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">{t('pendingVerify')} ({pending.length})</TabsTrigger>
          <TabsTrigger value="verified">{t('verified')} ({verified.length})</TabsTrigger>
          <TabsTrigger value="rejected">{t('rejectedStatus')} ({rejected.length})</TabsTrigger>
          <TabsTrigger value="all">{t('filterAll')} ({accounts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pending.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {pending.map((account) => {
                const Info = ACCOUNT_TYPE_INFO[account.account_type]
                const Icon = Info.icon
                return (
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <CardTitle className="text-lg">{account.account_name || Info.name}</CardTitle>
                            <CardDescription>{account.profiles?.display_name || account.profiles?.username || 'Unknown'}</CardDescription>
                          </div>
                        </div>
                        {getVerificationBadge(account.verification_status, account.is_verified)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold">账户信息:</p>
                        <p className="text-sm text-muted-foreground">{getAccountDisplayInfo(account)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">货币:</p>
                        <p className="text-sm text-muted-foreground">{account.currency}</p>
                      </div>
                      {account.verification_documents && Object.keys(account.verification_documents).length > 0 && (
                        <div>
                          <p className="mb-2 text-sm font-semibold">验证文档:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(account.verification_documents).map(([key, url]: [string, unknown]) => (
                              <img
                                key={key}
                                src={url as string}
                                alt={key}
                                className="cursor-pointer rounded-md border hover:opacity-80"
                                onClick={() => window.open(url as string, '_blank')}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <Button variant="outline" className="w-full" onClick={() => setSelectedAccount(account)}>
                        <Eye className="mr-2 h-4 w-4" />查看详情
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">没有待验证的支付账户</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          {verified.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {verified.map((account) => {
                const Info = ACCOUNT_TYPE_INFO[account.account_type]
                const Icon = Info.icon
                return (
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <CardTitle className="text-lg">{account.account_name || Info.name}</CardTitle>
                            <CardDescription>{account.profiles?.display_name || account.profiles?.username || 'Unknown'}</CardDescription>
                          </div>
                        </div>
                        {getVerificationBadge(account.verification_status, account.is_verified)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{getAccountDisplayInfo(account)}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">没有已验证的支付账户</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejected.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {rejected.map((account) => {
                const Info = ACCOUNT_TYPE_INFO[account.account_type]
                const Icon = Info.icon
                return (
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <CardTitle className="text-lg">{account.account_name || Info.name}</CardTitle>
                            <CardDescription>{account.profiles?.display_name || account.profiles?.username || 'Unknown'}</CardDescription>
                          </div>
                        </div>
                        {getVerificationBadge(account.verification_status, account.is_verified)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {account.verification_notes && (
                        <div className="mb-2">
                          <p className="text-sm font-semibold">拒绝原因:</p>
                          <p className="text-sm text-muted-foreground">{account.verification_notes}</p>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">{getAccountDisplayInfo(account)}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">{t('noRejectedPaymentAccounts')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((account) => {
              const Info = ACCOUNT_TYPE_INFO[account.account_type]
              const Icon = Info.icon
              return (
                <Card key={account.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-6 w-6" />
                        <div>
                          <CardTitle className="text-lg">{account.account_name || Info.name}</CardTitle>
                          <CardDescription>{account.profiles?.display_name || account.profiles?.username || 'Unknown'}</CardDescription>
                        </div>
                      </div>
                      {getVerificationBadge(account.verification_status, account.is_verified)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{getAccountDisplayInfo(account)}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {selectedAccount && (
        <Card className="fixed inset-4 z-50 m-auto max-h-[90vh] max-w-2xl overflow-y-auto">
          <CardHeader>
            <CardTitle>验证支付账户</CardTitle>
            <CardDescription>
              {getAccountTypeName(selectedAccount.account_type)} – {selectedAccount.profiles?.display_name || selectedAccount.profiles?.username}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold">账户信息:</p>
              <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(selectedAccount.account_info, null, 2)}
              </pre>
            </div>
            {selectedAccount.verification_documents && Object.keys(selectedAccount.verification_documents).length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">验证文档:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedAccount.verification_documents).map(([key, url]: [string, unknown]) => (
                    <img
                      key={key}
                      src={url as string}
                      alt={key}
                      className="cursor-pointer rounded-md border hover:opacity-80"
                      onClick={() => window.open(url as string, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="notes">验证备注（可选）</Label>
              <Textarea
                id="notes"
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder={t('enterVerifyNotes')}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleVerify('verified')} disabled={verifying} className="flex-1">
                {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : <><CheckCircle className="mr-2 h-4 w-4" />通过验证</>}
              </Button>
              <Button variant="destructive" onClick={() => handleVerify('rejected')} disabled={verifying} className="flex-1">
                {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{tCommon('submitting')}</> : <><XCircle className="mr-2 h-4 w-4" />{t('reject')}</>}
              </Button>
              <Button variant="outline" onClick={() => { setSelectedAccount(null); setVerificationNotes('') }}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
