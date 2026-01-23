'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/useToast'
import { CreditCard, Wallet, Smartphone, Loader2 } from 'lucide-react'

interface PlatformPaymentAccountFormProps {
  accountType: 'stripe' | 'paypal' | 'alipay' | 'wechat'
  initialData?: {
    id?: string
    accountName?: string
    accountInfo?: any
    currency?: string
    supportedCurrencies?: string[]
  }
  onSuccess?: () => void
  onCancel?: () => void
}

const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']

export function PlatformPaymentAccountForm({
  accountType,
  initialData,
  onSuccess,
  onCancel,
}: PlatformPaymentAccountFormProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    accountName: initialData?.accountName || '',
    currency: initialData?.currency || 'USD',
    supportedCurrencies: initialData?.supportedCurrencies || ['USD'],
    // Stripe fields
    stripeSecretKey: initialData?.accountInfo?.stripe_secret_key || '',
    stripePublishableKey: initialData?.accountInfo?.stripe_publishable_key || '',
    stripeWebhookSecret: initialData?.accountInfo?.stripe_webhook_secret || '',
    // PayPal fields
    paypalClientId: initialData?.accountInfo?.client_id || '',
    paypalClientSecret: initialData?.accountInfo?.client_secret || '',
    paypalSandbox: initialData?.accountInfo?.sandbox !== undefined ? initialData.accountInfo.sandbox : true,
    // Alipay fields
    alipayAppId: initialData?.accountInfo?.app_id || '',
    alipayPrivateKey: initialData?.accountInfo?.private_key || '',
    alipayPublicKey: initialData?.accountInfo?.public_key || '',
    // WeChat fields
    wechatMchId: initialData?.accountInfo?.mch_id || '',
    wechatAppId: initialData?.accountInfo?.app_id || '',
    wechatApiKey: initialData?.accountInfo?.api_key || '',
  })

  const getAccountInfo = () => {
    switch (accountType) {
      case 'stripe':
        return {
          stripe_secret_key: formData.stripeSecretKey,
          stripe_publishable_key: formData.stripePublishableKey,
          stripe_webhook_secret: formData.stripeWebhookSecret,
        }
      case 'paypal':
        return {
          client_id: formData.paypalClientId,
          client_secret: formData.paypalClientSecret,
          sandbox: formData.paypalSandbox,
        }
      case 'alipay':
        return {
          app_id: formData.alipayAppId,
          private_key: formData.alipayPrivateKey,
          public_key: formData.alipayPublicKey,
        }
      case 'wechat':
        return {
          mch_id: formData.wechatMchId,
          app_id: formData.wechatAppId,
          api_key: formData.wechatApiKey,
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
        accountName: formData.accountName || `Platform ${accountType} account`,
        accountInfo,
        currency: formData.currency,
        supportedCurrencies: formData.supportedCurrencies,
      }

      const url = initialData?.id
        ? `/api/admin/platform-payment-accounts/${initialData.id}`
        : '/api/admin/platform-payment-accounts'
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
        description: initialData?.id ? '平台支付账户已更新' : '平台支付账户已创建',
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
            <div>
              <Label htmlFor="stripeSecretKey">Stripe Secret Key</Label>
              <Input
                id="stripeSecretKey"
                type="password"
                value={formData.stripeSecretKey}
                onChange={(e) => setFormData({ ...formData, stripeSecretKey: e.target.value })}
                placeholder="sk_live_... 或 sk_test_..."
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                从 Stripe Dashboard 获取的 Secret Key
              </p>
            </div>
            <div>
              <Label htmlFor="stripePublishableKey">Stripe Publishable Key</Label>
              <Input
                id="stripePublishableKey"
                value={formData.stripePublishableKey}
                onChange={(e) => setFormData({ ...formData, stripePublishableKey: e.target.value })}
                placeholder="pk_live_... 或 pk_test_..."
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                从 Stripe Dashboard 获取的 Publishable Key
              </p>
            </div>
            <div>
              <Label htmlFor="stripeWebhookSecret">Stripe Webhook Secret</Label>
              <Input
                id="stripeWebhookSecret"
                type="password"
                value={formData.stripeWebhookSecret}
                onChange={(e) => setFormData({ ...formData, stripeWebhookSecret: e.target.value })}
                placeholder="whsec_..."
              />
              <p className="text-sm text-muted-foreground mt-1">
                从 Stripe Webhook 设置中获取的 Webhook Secret（用于验证 webhook 签名）
              </p>
            </div>
          </div>
        )
      case 'paypal':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="paypalClientId">PayPal Client ID</Label>
              <Input
                id="paypalClientId"
                value={formData.paypalClientId}
                onChange={(e) => setFormData({ ...formData, paypalClientId: e.target.value })}
                placeholder="PayPal Client ID"
                required
              />
            </div>
            <div>
              <Label htmlFor="paypalClientSecret">PayPal Client Secret</Label>
              <Input
                id="paypalClientSecret"
                type="password"
                value={formData.paypalClientSecret}
                onChange={(e) => setFormData({ ...formData, paypalClientSecret: e.target.value })}
                placeholder="PayPal Client Secret"
                required
              />
            </div>
            <div>
              <Label>
                <input
                  type="checkbox"
                  checked={formData.paypalSandbox}
                  onChange={(e) => setFormData({ ...formData, paypalSandbox: e.target.checked })}
                  className="mr-2"
                />
                使用沙盒环境（Sandbox）
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                勾选以使用 PayPal 沙盒环境进行测试
              </p>
            </div>
          </div>
        )
      case 'alipay':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="alipayAppId">支付宝 App ID</Label>
              <Input
                id="alipayAppId"
                value={formData.alipayAppId}
                onChange={(e) => setFormData({ ...formData, alipayAppId: e.target.value })}
                placeholder="支付宝开放平台 App ID"
                required
              />
            </div>
            <div>
              <Label htmlFor="alipayPrivateKey">支付宝应用私钥</Label>
              <Textarea
                id="alipayPrivateKey"
                value={formData.alipayPrivateKey}
                onChange={(e) => setFormData({ ...formData, alipayPrivateKey: e.target.value })}
                placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                rows={6}
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                支付宝应用私钥（RSA2）
              </p>
            </div>
            <div>
              <Label htmlFor="alipayPublicKey">支付宝公钥</Label>
              <Textarea
                id="alipayPublicKey"
                value={formData.alipayPublicKey}
                onChange={(e) => setFormData({ ...formData, alipayPublicKey: e.target.value })}
                placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                rows={6}
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                支付宝公钥（用于验证回调）
              </p>
            </div>
          </div>
        )
      case 'wechat':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="wechatMchId">微信商户号 (Mch ID)</Label>
              <Input
                id="wechatMchId"
                value={formData.wechatMchId}
                onChange={(e) => setFormData({ ...formData, wechatMchId: e.target.value })}
                placeholder="微信支付商户号"
                required
              />
            </div>
            <div>
              <Label htmlFor="wechatAppId">微信 App ID</Label>
              <Input
                id="wechatAppId"
                value={formData.wechatAppId}
                onChange={(e) => setFormData({ ...formData, wechatAppId: e.target.value })}
                placeholder="微信开放平台 App ID"
                required
              />
            </div>
            <div>
              <Label htmlFor="wechatApiKey">微信 API Key</Label>
              <Input
                id="wechatApiKey"
                type="password"
                value={formData.wechatApiKey}
                onChange={(e) => setFormData({ ...formData, wechatApiKey: e.target.value })}
                placeholder="微信支付 API Key"
                required
              />
              <p className="text-sm text-muted-foreground mt-1">
                微信支付商户平台的 API Key
              </p>
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
            <CardTitle>平台 {getAccountTypeName()} 账户</CardTitle>
            <CardDescription>
              {initialData?.id ? '更新平台支付账户配置' : '添加新的平台支付账户'}
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
              placeholder={`平台 ${getAccountTypeName()} 账户`}
            />
            <p className="text-sm text-muted-foreground mt-1">
              用于识别此平台账户的友好名称
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
