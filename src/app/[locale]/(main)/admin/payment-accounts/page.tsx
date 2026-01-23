/**
 * Admin payment account verification page
 * Allows admins to view and verify payment accounts
 */

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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
  profiles?: {
    id: string
    username: string
    display_name: string
  }
}

const ACCOUNT_TYPE_INFO: Record<string, { name: string; icon: any }> = {
  stripe: { name: 'Stripe', icon: CreditCard },
  paypal: { name: 'PayPal', icon: Wallet },
  alipay: { name: '支付宝', icon: Smartphone },
  wechat: { name: '微信支付', icon: Smartphone },
  bank: { name: '银行转账', icon: Building2 },
}

export default function AdminPaymentAccountsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!user) return
    loadAccounts()
  }, [user])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      // Check admin access
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        router.push('/')
        return
      }

      // Load all payment accounts
      const { data: accountsData, error } = await supabase
        .from('payment_accounts')
        .select(`
          *,
          profiles!payment_accounts_seller_id_fkey(id, username, display_name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      setAccounts(accountsData || [])
    } catch (error: any) {
      console.error('Error loading accounts:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '加载支付账户失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (status: 'verified' | 'rejected') => {
    if (!selectedAccount) return

    setVerifying(true)
    try {
      const response = await fetch(`/api/admin/payment-accounts/${selectedAccount.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes: verificationNotes || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '验证失败')
      }

      toast({
        variant: 'success',
        title: '成功',
        description: status === 'verified' ? '支付账户已通过验证' : '支付账户已拒绝',
      })

      setSelectedAccount(null)
      setVerificationNotes('')
      loadAccounts()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '验证失败',
      })
    } finally {
      setVerifying(false)
    }
  }

  const getVerificationBadge = (status: string, isVerified: boolean) => {
    if (isVerified && status === 'verified') {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="mr-1 h-3 w-3" />
          已验证
        </Badge>
      )
    }
    if (status === 'pending') {
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />
          待验证
        </Badge>
      )
    }
    if (status === 'rejected') {
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          已拒绝
        </Badge>
      )
    }
    return null
  }

  const getAccountDisplayInfo = (account: PaymentAccount) => {
    const info = account.account_info || {}
    switch (account.account_type) {
      case 'stripe':
        return info.stripe?.account_id ? `账户ID: ${info.stripe.account_id}` : '未连接'
      case 'paypal':
        return info.paypal?.email || '未设置'
      case 'alipay':
        return `${info.alipay?.account || '未设置'} (${info.alipay?.real_name || ''})`
      case 'wechat':
        return `商户号: ${info.wechat?.mch_id || '未设置'}`
      case 'bank':
        return `${info.bank?.bank_name || ''} ${info.bank?.account_number || ''}`
      default:
        return '未设置'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  const pendingAccounts = accounts.filter((a) => a.verification_status === 'pending')
  const verifiedAccounts = accounts.filter((a) => a.verification_status === 'verified')
  const rejectedAccounts = accounts.filter((a) => a.verification_status === 'rejected')

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">支付账户验证</h1>
        <p className="text-muted-foreground mt-2">管理卖家支付账户的验证状态</p>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            待验证 ({pendingAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="verified">
            已验证 ({verifiedAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            已拒绝 ({rejectedAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            全部 ({accounts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingAccounts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingAccounts.map((account) => {
                const typeInfo = ACCOUNT_TYPE_INFO[account.account_type]
                const Icon = typeInfo.icon
                return (
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <CardTitle className="text-lg">
                              {account.account_name || typeInfo.name}
                            </CardTitle>
                            <CardDescription>
                              {account.profiles?.display_name || account.profiles?.username || 'Unknown'}
                            </CardDescription>
                          </div>
                        </div>
                        {getVerificationBadge(account.verification_status, account.is_verified)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold">账户信息:</p>
                        <p className="text-sm text-muted-foreground">
                          {getAccountDisplayInfo(account)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">货币:</p>
                        <p className="text-sm text-muted-foreground">{account.currency}</p>
                      </div>
                      {account.verification_documents && Object.keys(account.verification_documents).length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-2">验证文档:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(account.verification_documents).map(([key, url]: [string, any]) => (
                              <img
                                key={key}
                                src={url}
                                alt={key}
                                className="rounded-md border cursor-pointer hover:opacity-80"
                                onClick={() => window.open(url, '_blank')}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setSelectedAccount(account)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        查看详情
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">没有待验证的支付账户</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          {verifiedAccounts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {verifiedAccounts.map((account) => {
                const typeInfo = ACCOUNT_TYPE_INFO[account.account_type]
                const Icon = typeInfo.icon
                return (
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <CardTitle className="text-lg">
                              {account.account_name || typeInfo.name}
                            </CardTitle>
                            <CardDescription>
                              {account.profiles?.display_name || account.profiles?.username || 'Unknown'}
                            </CardDescription>
                          </div>
                        </div>
                        {getVerificationBadge(account.verification_status, account.is_verified)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {getAccountDisplayInfo(account)}
                      </p>
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
          {rejectedAccounts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {rejectedAccounts.map((account) => {
                const typeInfo = ACCOUNT_TYPE_INFO[account.account_type]
                const Icon = typeInfo.icon
                return (
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <CardTitle className="text-lg">
                              {account.account_name || typeInfo.name}
                            </CardTitle>
                            <CardDescription>
                              {account.profiles?.display_name || account.profiles?.username || 'Unknown'}
                            </CardDescription>
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
                      <p className="text-sm text-muted-foreground">
                        {getAccountDisplayInfo(account)}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">没有已拒绝的支付账户</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((account) => {
              const typeInfo = ACCOUNT_TYPE_INFO[account.account_type]
              const Icon = typeInfo.icon
              return (
                <Card key={account.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-6 w-6" />
                        <div>
                          <CardTitle className="text-lg">
                            {account.account_name || typeInfo.name}
                          </CardTitle>
                          <CardDescription>
                            {account.profiles?.display_name || account.profiles?.username || 'Unknown'}
                          </CardDescription>
                        </div>
                      </div>
                      {getVerificationBadge(account.verification_status, account.is_verified)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {getAccountDisplayInfo(account)}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Verification Dialog */}
      {selectedAccount && (
        <Card className="fixed inset-4 z-50 m-auto max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader>
            <CardTitle>验证支付账户</CardTitle>
            <CardDescription>
              {ACCOUNT_TYPE_INFO[selectedAccount.account_type]?.name} -{' '}
              {selectedAccount.profiles?.display_name || selectedAccount.profiles?.username}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-semibold">账户信息:</p>
              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                {JSON.stringify(selectedAccount.account_info, null, 2)}
              </pre>
            </div>
            {selectedAccount.verification_documents && Object.keys(selectedAccount.verification_documents).length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">验证文档:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedAccount.verification_documents).map(([key, url]: [string, any]) => (
                    <img
                      key={key}
                      src={url}
                      alt={key}
                      className="rounded-md border cursor-pointer hover:opacity-80"
                      onClick={() => window.open(url, '_blank')}
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
                placeholder="输入验证备注..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleVerify('verified')}
                disabled={verifying}
                className="flex-1"
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    通过验证
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleVerify('rejected')}
                disabled={verifying}
                className="flex-1"
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    拒绝
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedAccount(null)
                  setVerificationNotes('')
                }}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
