'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/useToast'
import { CreditCard, Wallet, Smartphone, Building2, Loader2 } from 'lucide-react'

interface PaymentAccountFormProps {
  accountType: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  initialData?: {
    id?: string
    accountName?: string
    accountInfo?: any
    currency?: string
    supportedCurrencies?: string[]
    isDefault?: boolean
  }
  onSuccess?: () => void
  onCancel?: () => void
}

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']

export function PaymentAccountForm({
  accountType,
  initialData,
  onSuccess,
  onCancel,
}: PaymentAccountFormProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    accountName: initialData?.accountName || '',
    currency: initialData?.currency || 'USD',
    supportedCurrencies: initialData?.supportedCurrencies || ['USD'],
    isDefault: initialData?.isDefault || false,
    // Account-specific fields
    stripeAccountId: initialData?.accountInfo?.stripe?.account_id || '',
    paypalEmail: initialData?.accountInfo?.paypal?.email || '',
    alipayAccount: initialData?.accountInfo?.alipay?.account || '',
    alipayRealName: initialData?.accountInfo?.alipay?.real_name || '',
    wechatMchId: initialData?.accountInfo?.wechat?.mch_id || '',
    wechatAppId: initialData?.accountInfo?.wechat?.app_id || '',
    bankAccountNumber: initialData?.accountInfo?.bank?.account_number || '',
    bankName: initialData?.accountInfo?.bank?.bank_name || '',
    bankSwiftCode: initialData?.accountInfo?.bank?.swift_code || '',
  })

  const getAccountInfo = () => {
    switch (accountType) {
      case 'stripe':
        return {
          stripe: {
            account_id: formData.stripeAccountId,
          },
        }
      case 'paypal':
        return {
          paypal: {
            email: formData.paypalEmail,
            currency: formData.currency,
          },
        }
      case 'alipay':
        return {
          alipay: {
            account: formData.alipayAccount,
            real_name: formData.alipayRealName,
          },
        }
      case 'wechat':
        return {
          wechat: {
            mch_id: formData.wechatMchId,
            app_id: formData.wechatAppId,
          },
        }
      case 'bank':
        return {
          bank: {
            account_number: formData.bankAccountNumber,
            bank_name: formData.bankName,
            swift_code: formData.bankSwiftCode,
          },
        }
      default:
        return {}
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const accountInfo = getAccountInfo()
      const payload = {
        accountType,
        accountName: formData.accountName || `${accountType} account`,
        accountInfo,
        currency: formData.currency,
        supportedCurrencies: formData.supportedCurrencies,
        isDefault: formData.isDefault,
      }

      const url = initialData?.id
        ? `/api/payment-accounts/${initialData.id}`
        : '/api/payment-accounts'
      const method = initialData?.id ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save account')
      }

      toast({
        variant: 'success',
        title: '成功',
        description: initialData?.id ? '支付账户已更新' : '支付账户已创建',
      })

      onSuccess?.()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '保存失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const renderAccountFields = () => {
    switch (accountType) {
      case 'stripe':
        return (
          <div className="space-y-4">
            {!initialData?.id && (
              <div>
                <Label>连接 Stripe 账户</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-2">
                  点击下方按钮连接到您的 Stripe 账户
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const returnUrl = `${window.location.origin}/api/payments/stripe/connect/callback`
                      const refreshUrl = `${window.location.origin}/seller/payment-accounts`
                      
                      const response = await fetch('/api/payments/stripe/connect/create-account', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ returnUrl, refreshUrl }),
                      })

                      if (!response.ok) {
                        const error = await response.json()
                        throw new Error(error.error || 'Failed to create Stripe Connect account')
                      }

                      const data = await response.json()
                      // Redirect to Stripe onboarding
                      window.location.href = data.accountLinkUrl
                    } catch (error: any) {
                      toast({
                        variant: 'destructive',
                        title: '错误',
                        description: error.message || '连接失败',
                      })
                    }
                  }}
                >
                  连接 Stripe 账户
                </Button>
              </div>
            )}
            <div>
              <Label htmlFor="stripeAccountId">Stripe Connect 账户ID</Label>
              <Input
                id="stripeAccountId"
                value={formData.stripeAccountId}
                onChange={(e) => setFormData({ ...formData, stripeAccountId: e.target.value })}
                placeholder="acct_xxxxx"
                disabled={!initialData?.id}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {initialData?.id 
                  ? 'Stripe Connect 账户ID（编辑模式）'
                  : '通过 Stripe Connect 连接后自动获取'}
              </p>
            </div>
          </div>
        )
      case 'paypal':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="paypalEmail">PayPal 邮箱</Label>
              <Input
                id="paypalEmail"
                type="email"
                value={formData.paypalEmail}
                onChange={(e) => setFormData({ ...formData, paypalEmail: e.target.value })}
                placeholder="example@paypal.com"
                required
              />
            </div>
          </div>
        )
      case 'alipay':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="alipayAccount">支付宝账号</Label>
              <Input
                id="alipayAccount"
                value={formData.alipayAccount}
                onChange={(e) => setFormData({ ...formData, alipayAccount: e.target.value })}
                placeholder="手机号或邮箱"
                required
              />
            </div>
            <div>
              <Label htmlFor="alipayRealName">真实姓名</Label>
              <Input
                id="alipayRealName"
                value={formData.alipayRealName}
                onChange={(e) => setFormData({ ...formData, alipayRealName: e.target.value })}
                placeholder="与支付宝账户一致"
                required
              />
            </div>
          </div>
        )
      case 'wechat':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="wechatMchId">微信商户号</Label>
              <Input
                id="wechatMchId"
                value={formData.wechatMchId}
                onChange={(e) => setFormData({ ...formData, wechatMchId: e.target.value })}
                placeholder="商户号"
                required
              />
            </div>
            <div>
              <Label htmlFor="wechatAppId">微信 App ID</Label>
              <Input
                id="wechatAppId"
                value={formData.wechatAppId}
                onChange={(e) => setFormData({ ...formData, wechatAppId: e.target.value })}
                placeholder="App ID"
                required
              />
            </div>
          </div>
        )
      case 'bank':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="bankAccountNumber">银行账号</Label>
              <Input
                id="bankAccountNumber"
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                placeholder="银行账号"
                required
              />
            </div>
            <div>
              <Label htmlFor="bankName">银行名称</Label>
              <Input
                id="bankName"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="银行名称"
                required
              />
            </div>
            <div>
              <Label htmlFor="bankSwiftCode">SWIFT 代码（国际转账）</Label>
              <Input
                id="bankSwiftCode"
                value={formData.bankSwiftCode}
                onChange={(e) => setFormData({ ...formData, bankSwiftCode: e.target.value })}
                placeholder="SWIFT/BIC 代码（可选）"
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  const getAccountTypeIcon = () => {
    switch (accountType) {
      case 'stripe':
        return CreditCard
      case 'paypal':
        return Wallet
      case 'alipay':
      case 'wechat':
        return Smartphone
      case 'bank':
        return Building2
      default:
        return CreditCard
    }
  }

  const getAccountTypeName = () => {
    const names: Record<string, string> = {
      stripe: 'Stripe',
      paypal: 'PayPal',
      alipay: '支付宝',
      wechat: '微信支付',
      bank: '银行转账',
    }
    return names[accountType] || accountType
  }

  const Icon = getAccountTypeIcon()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{getAccountTypeName()} 账户</CardTitle>
            <CardDescription>
              {initialData?.id ? '更新支付账户信息' : '添加新的支付账户'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="accountName">账户名称</Label>
            <Input
              id="accountName"
              value={formData.accountName}
              onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
              placeholder={`${getAccountTypeName()} 账户`}
            />
            <p className="text-sm text-muted-foreground mt-1">
              用于识别此账户的友好名称
            </p>
          </div>

          {renderAccountFields()}

          <div>
            <Label htmlFor="currency">主要货币</Label>
            <select
              id="currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              required
            >
              {CURRENCIES.map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="mr-2"
              />
              设为默认账户（此类型的默认账户）
            </Label>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData?.id ? '更新' : '创建'}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                取消
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
