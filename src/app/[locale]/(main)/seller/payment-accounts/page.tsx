'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PaymentAccountForm } from '@/components/payments/PaymentAccountForm'
import { useToast } from '@/lib/hooks/useToast'
import {
  CreditCard,
  Wallet,
  Smartphone,
  Building2,
  Plus,
  Edit,
  Trash2,
  Star,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'

type AccountType = 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'

interface PaymentAccount {
  id: string
  account_type: AccountType
  account_name: string | null
  account_info: any
  currency: string
  supported_currencies: string[]
  is_default: boolean
  is_verified: boolean
  verification_status: 'pending' | 'verified' | 'rejected' | 'expired'
  created_at: string
}

const ACCOUNT_TYPE_INFO: Record<AccountType, { name: string; icon: any; color: string }> = {
  stripe: { name: 'Stripe', icon: CreditCard, color: 'text-blue-600' },
  paypal: { name: 'PayPal', icon: Wallet, color: 'text-blue-500' },
  alipay: { name: '支付宝', icon: Smartphone, color: 'text-blue-400' },
  wechat: { name: '微信支付', icon: Smartphone, color: 'text-green-500' },
  bank: { name: '银行转账', icon: Building2, color: 'text-gray-600' },
}

export default function PaymentAccountsPage() {
  const { user, loading: authLoading } = useAuthGuard()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | null>(null)
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['payment-accounts', user?.id],
    queryFn: async () => {
      if (!user) return { accounts: [], profileStatus: null }
      const response = await fetch('/api/payment-accounts')
      if (!response.ok) throw new Error('Failed to fetch accounts')
      const data = await response.json()
      return {
        accounts: data.accounts as PaymentAccount[],
        profileStatus: data.profileStatus as {
          payment_provider: string | null
          payment_account_id: string | null
          provider_charges_enabled: boolean | null
          provider_payouts_enabled: boolean | null
          provider_account_status: string | null
          seller_payout_eligibility: 'eligible' | 'blocked' | 'pending_review' | null
        } | null
      }
    },
    enabled: !!user,
  })

  const accounts = accountsData?.accounts || []
  const profileStatus = accountsData?.profileStatus

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const response = await fetch(`/api/payment-accounts/${accountId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete account')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] })
      toast({
        variant: 'success',
        title: '成功',
        description: '支付账户已删除',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '删除失败',
      })
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const response = await fetch(`/api/payment-accounts/${accountId}/set-default`, {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to set default account')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] })
      toast({
        variant: 'success',
        title: '成功',
        description: '默认账户已更新',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '设置失败',
      })
    },
  })

  const handleAddAccount = (type: AccountType) => {
    setSelectedAccountType(type)
    setEditingAccount(null)
    setIsDialogOpen(true)
  }

  const handleEditAccount = (account: PaymentAccount) => {
    setSelectedAccountType(account.account_type)
    setEditingAccount(account)
    setIsDialogOpen(true)
  }

  const handleFormSuccess = () => {
    setIsDialogOpen(false)
    setSelectedAccountType(null)
    setEditingAccount(null)
    queryClient.invalidateQueries({ queryKey: ['payment-accounts'] })
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
        return info.stripe?.account_id ? `账户: ${info.stripe.account_id.substring(0, 20)}...` : '未连接'
      case 'paypal':
        return info.paypal?.email || '未设置'
      case 'alipay':
        return info.alipay?.account || '未设置'
      case 'wechat':
        return info.wechat?.mch_id || '未设置'
      case 'bank':
        return `${info.bank?.bank_name || ''} ${info.bank?.account_number || ''}`
      default:
        return '未设置'
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Get eligibility status badge
  const getEligibilityBadge = (eligibility: 'eligible' | 'blocked' | 'pending_review' | null | undefined) => {
    if (!eligibility) {
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />
          未设置
        </Badge>
      )
    }
    if (eligibility === 'eligible') {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="mr-1 h-3 w-3" />
          可正常收款
        </Badge>
      )
    }
    if (eligibility === 'pending_review') {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-600">
          <Clock className="mr-1 h-3 w-3" />
          待审核
        </Badge>
      )
    }
    if (eligibility === 'blocked') {
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          收款已禁用
        </Badge>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {profileStatus && (
        <Card className={profileStatus.seller_payout_eligibility === 'eligible' ? 'border-green-500' : profileStatus.seller_payout_eligibility === 'blocked' ? 'border-red-500' : 'border-yellow-500'}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {profileStatus.seller_payout_eligibility === 'eligible' && <CheckCircle className="h-5 w-5 text-green-500" />}
                {profileStatus.seller_payout_eligibility === 'blocked' && <XCircle className="h-5 w-5 text-red-500" />}
                {(profileStatus.seller_payout_eligibility === 'pending_review' || !profileStatus.seller_payout_eligibility) && <Clock className="h-5 w-5 text-yellow-500" />}
                <div>
                  <p className="font-semibold">收款账户状态</p>
                  <p className="text-sm text-muted-foreground">
                    {profileStatus.seller_payout_eligibility === 'eligible' && '您的账户可以正常接收付款'}
                    {profileStatus.seller_payout_eligibility === 'blocked' && '您的账户已被禁用，无法接收付款'}
                    {profileStatus.seller_payout_eligibility === 'pending_review' && '您的账户正在审核中，暂时无法接收付款'}
                    {!profileStatus.seller_payout_eligibility && '请绑定收款账户以开始接收付款'}
                  </p>
                </div>
              </div>
              {getEligibilityBadge(profileStatus.seller_payout_eligibility)}
            </div>
            {profileStatus.payment_provider && (
              <div className="mt-4 text-sm text-muted-foreground">
                <p>支付方式: {profileStatus.payment_provider}</p>
                {profileStatus.payment_provider === 'stripe' && (
                  <p>
                    账户状态: {profileStatus.provider_charges_enabled && profileStatus.provider_payouts_enabled ? '已启用' : '待完成'}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">支付账户管理</h1>
          <p className="text-muted-foreground">管理您的收款账户，支持多种支付方式</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedAccountType(null)}>
              <Plus className="mr-2 h-4 w-4" />
              添加账户
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? '编辑支付账户' : '添加支付账户'}
              </DialogTitle>
              <DialogDescription>
                {!selectedAccountType && !editingAccount && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {Object.entries(ACCOUNT_TYPE_INFO).map(([type, info]) => {
                      const Icon = info.icon
                      return (
                        <Card
                          key={type}
                          className="cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => handleAddAccount(type as AccountType)}
                        >
                          <CardContent className="flex items-center gap-3 p-4">
                            <Icon className={`h-6 w-6 ${info.color}`} />
                            <span className="font-medium">{info.name}</span>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            {selectedAccountType && (
              <PaymentAccountForm
                accountType={selectedAccountType}
                initialData={editingAccount ? {
                  id: editingAccount.id,
                  accountName: editingAccount.account_name || undefined,
                  accountInfo: editingAccount.account_info,
                  currency: editingAccount.currency,
                  supportedCurrencies: editingAccount.supported_currencies,
                  isDefault: editingAccount.is_default,
                } : undefined}
                onSuccess={handleFormSuccess}
                onCancel={() => setIsDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => {
            const typeInfo = ACCOUNT_TYPE_INFO[account.account_type]
            const Icon = typeInfo.icon
            return (
              <Card key={account.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-muted ${typeInfo.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {account.account_name || typeInfo.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {getAccountDisplayInfo(account)}
                        </CardDescription>
                      </div>
                    </div>
                    {account.is_default && (
                      <Badge variant="default">
                        <Star className="mr-1 h-3 w-3" />
                        默认
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">货币:</span>
                    <span>{account.currency}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">验证状态:</span>
                    {getVerificationBadge(account.verification_status, account.is_verified)}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditAccount(account)}
                      className="flex-1"
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      编辑
                    </Button>
                    {!account.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(account.id)}
                        disabled={setDefaultMutation.isPending}
                      >
                        <Star className="mr-2 h-4 w-4" />
                        设默认
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm('确定要删除此支付账户吗？')) {
                          deleteMutation.mutate(account.id)
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">您还没有添加任何支付账户</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              添加第一个账户
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
