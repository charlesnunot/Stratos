/**
 * Platform payment accounts management page
 * Allows admins to manage platform payment accounts (Stripe, PayPal, Alipay, WeChat)
 */

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/useToast'
import {
  CreditCard,
  Wallet,
  Smartphone,
  Plus,
  Edit,
  Trash2,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import { PlatformPaymentAccountForm } from '@/components/payments/PlatformPaymentAccountForm'

interface PlatformPaymentAccount {
  id: string
  account_type: 'stripe' | 'paypal' | 'alipay' | 'wechat'
  account_name: string | null
  account_info: any
  currency: string
  supported_currencies: string[]
  is_verified: boolean
  created_at: string
}

const ACCOUNT_TYPE_INFO: Record<string, { name: string; icon: any }> = {
  stripe: { name: 'Stripe', icon: CreditCard },
  paypal: { name: 'PayPal', icon: Wallet },
  alipay: { name: '支付宝', icon: Smartphone },
  wechat: { name: '微信支付', icon: Smartphone },
}

export default function PlatformPaymentAccountsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<PlatformPaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<PlatformPaymentAccount | null>(null)
  const [selectedAccountType, setSelectedAccountType] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

      // Load platform payment accounts
      const response = await fetch('/api/admin/platform-payment-accounts')
      if (!response.ok) {
        throw new Error('Failed to load platform accounts')
      }

      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (error: any) {
      console.error('Error loading platform accounts:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '加载平台支付账户失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = (accountType: 'stripe' | 'paypal' | 'alipay' | 'wechat') => {
    setSelectedAccountType(accountType)
    setEditingAccount(null)
    setShowForm(true)
  }

  const handleEdit = (account: PlatformPaymentAccount) => {
    setEditingAccount(account)
    setSelectedAccountType(account.account_type)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此平台支付账户吗？')) {
      return
    }

    setDeletingId(id)
    try {
      const response = await fetch(`/api/admin/platform-payment-accounts/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '删除失败')
      }

      toast({
        variant: 'success',
        title: '成功',
        description: '平台支付账户已删除',
      })

      loadAccounts()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '删除失败',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingAccount(null)
    setSelectedAccountType(null)
    loadAccounts()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingAccount(null)
    setSelectedAccountType(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (showForm && selectedAccountType) {
    return (
      <div className="max-w-4xl mx-auto">
        <PlatformPaymentAccountForm
          accountType={selectedAccountType}
          initialData={editingAccount ? {
            id: editingAccount.id,
            accountName: editingAccount.account_name || undefined,
            accountInfo: editingAccount.account_info,
            currency: editingAccount.currency,
            supportedCurrencies: editingAccount.supported_currencies,
          } : undefined}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      </div>
    )
  }

  const existingAccountTypes = accounts.map(a => a.account_type)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">平台支付账户管理</h1>
          <p className="text-muted-foreground mt-2">
            管理平台用于接收订阅费用的支付账户配置
          </p>
        </div>
      </div>

      {/* Add new account buttons */}
      <Card>
        <CardHeader>
          <CardTitle>添加平台支付账户</CardTitle>
          <CardDescription>
            每种支付方式只能配置一个平台账户
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['stripe', 'paypal', 'alipay', 'wechat'] as const).map((type) => {
              const Info = ACCOUNT_TYPE_INFO[type]
              const Icon = Info.icon
              const exists = existingAccountTypes.includes(type)

              return (
                <Button
                  key={type}
                  variant={exists ? 'outline' : 'default'}
                  className="h-auto flex-col gap-2 py-6"
                  onClick={() => handleCreate(type)}
                  disabled={exists}
                >
                  <Icon className="h-6 w-6" />
                  <span>{Info.name}</span>
                  {exists && (
                    <Badge variant="secondary" className="text-xs">
                      已配置
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Existing accounts */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">暂无平台支付账户</p>
            <p className="text-sm text-muted-foreground mt-2">
              点击上方按钮添加平台支付账户
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => {
            const Info = ACCOUNT_TYPE_INFO[account.account_type]
            const Icon = Info.icon

            return (
              <Card key={account.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle>{account.account_name || Info.name}</CardTitle>
                        <CardDescription>
                          {Info.name} • {account.currency}
                          {account.supported_currencies.length > 1 && (
                            <span className="ml-2">
                              (支持: {account.supported_currencies.join(', ')})
                            </span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {account.is_verified && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          已验证
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(account)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(account.id)}
                        disabled={deletingId === account.id}
                      >
                        {deletingId === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            删除
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    <p>创建时间: {new Date(account.created_at).toLocaleString('zh-CN')}</p>
                    <p className="mt-1">
                      账户类型: {account.account_type}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
