'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CreditCard, Upload } from 'lucide-react'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { useToast } from '@/lib/hooks/useToast'
import { getWeChatQRCodeUrl } from '@/lib/utils/share'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
)

export default function OrderPayPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<
    'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  >('stripe')
  const [processing, setProcessing] = useState(false)
  const [weChatCodeUrl, setWeChatCodeUrl] = useState<string | null>(null)
  const [showWeChatQR, setShowWeChatQR] = useState(false)
  const [showBankTransfer, setShowBankTransfer] = useState(false)
  const [bankAccountInfo, setBankAccountInfo] = useState<any>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [bankFormData, setBankFormData] = useState({
    bankName: '',
    transactionNumber: '',
    transferAmount: '',
    transferDate: new Date().toISOString().split('T')[0],
  })

  // Update transfer amount when order loads
  useEffect(() => {
    if (order) {
      setBankFormData(prev => ({
        ...prev,
        transferAmount: order.total_amount.toString(),
      }))
    }
  }, [order])

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!orderId,
  })

  const handlePayment = async () => {
    if (!order || !user) return

    setProcessing(true)

    try {
      if (paymentMethod === 'stripe') {
        // Create checkout session for order
        const response = await fetch('/api/payments/stripe/create-order-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: order.id,
            successUrl: `${window.location.origin}/orders/${orderId}?payment=success`,
            cancelUrl: `${window.location.origin}/orders/${orderId}/pay`,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create checkout session')
        }

        const { url } = await response.json()
        
        // Redirect to Stripe Checkout
        window.location.href = url
      } else if (paymentMethod === 'paypal') {
        // PayPal payment is handled by PayPalButton component
        // This should not be reached if PayPal button is used
        toast({
          variant: 'info',
          title: '提示',
          description: '请使用PayPal按钮进行支付',
        })
        return
      } else if (paymentMethod === 'alipay') {
        // Create Alipay order
        const response = await fetch('/api/payments/alipay/create-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: order.total_amount,
            orderId: order.id,
            subject: `订单 ${order.order_number}`,
            returnUrl: `${window.location.origin}/orders/${orderId}`,
            notifyUrl: `${window.location.origin}/api/payments/alipay/callback`,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create Alipay order')
        }

        const { orderString } = await response.json()

        // In production, this would redirect to Alipay payment page
        // For now, we'll show a message and redirect after a delay
        // In real implementation, use Alipay SDK to open payment page
        toast({
          variant: 'info',
          title: '提示',
          description: '正在跳转到支付宝支付页面...',
        })

        // Simulate redirect (in production, use actual Alipay SDK)
        setTimeout(() => {
          router.push(`/orders/${orderId}`)
        }, 2000)
      } else if (paymentMethod === 'wechat') {
        // Create WeChat Pay order
        const response = await fetch('/api/payments/wechat/create-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: order.id,
            amount: order.total_amount,
            description: `订单 ${order.order_number}`,
            notifyUrl: `${window.location.origin}/api/payments/wechat/notify`,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create WeChat Pay order')
        }

        const { codeUrl } = await response.json()

        // Store codeUrl in state and show QR code
        setWeChatCodeUrl(codeUrl)
        setShowWeChatQR(true)
      } else if (paymentMethod === 'bank') {
        // Fetch bank account information
        const { data: bankInfo } = await supabase
          .from('bank_account_settings')
          .select('*')
          .eq('is_active', true)
          .single()

        if (!bankInfo) {
          throw new Error('银行账户信息未配置')
        }

        // Create payment transaction
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        )

        await supabaseAdmin.from('payment_transactions').insert({
          type: 'order',
          provider: 'bank',
          provider_ref: `bank_${orderId}_${Date.now()}`,
          amount: order.total_amount,
          currency: 'CNY',
          status: 'pending',
          related_id: orderId,
        })

        // Update order with payment method
        const { error } = await supabase
          .from('orders')
          .update({
            payment_method: 'bank',
            payment_status: 'pending', // Manual verification needed
          })
          .eq('id', orderId)

        if (error) throw error

        setBankAccountInfo(bankInfo)
        setShowBankTransfer(true)
      } else {
        // Other payment methods - placeholder
        toast({
          variant: 'warning',
          title: '提示',
          description: `${paymentMethod} 支付功能开发中`,
        })
      }
    } catch (error: any) {
      console.error('Payment error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: `支付失败: ${error.message}`,
      })
    } finally {
      setProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">订单不存在</p>
      </div>
    )
  }

  if (order.payment_status === 'paid') {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CreditCard className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h2 className="mb-2 text-2xl font-bold">订单已支付</h2>
          <p className="mb-6 text-muted-foreground">
            您的订单已成功支付，我们将尽快处理
          </p>
          <Button onClick={() => router.push(`/orders/${orderId}`)}>
            查看订单详情
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">支付订单</h1>

      {/* Order Summary */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">订单信息</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">订单号</span>
            <span className="font-semibold">{order.order_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">订单金额</span>
            <span className="text-xl font-bold">
              ¥{order.total_amount.toFixed(2)}
            </span>
          </div>
        </div>
      </Card>

      {/* Payment Method Selection */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">选择支付方式</h2>
        <PaymentMethodSelector
          selectedMethod={paymentMethod}
          onSelect={setPaymentMethod}
        />
      </Card>

      {/* Payment Button */}
      {paymentMethod === 'paypal' ? (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">使用PayPal支付</h3>
          <PayPalButton
            amount={order.total_amount}
            currency="CNY"
            metadata={{
              type: 'order',
              orderId: order.id,
            }}
            onSuccess={async (orderId) => {
              // Refresh and redirect
              router.refresh()
              router.push(`/orders/${orderId}`)
            }}
            onError={(error) => {
              toast({
                variant: 'destructive',
                title: '错误',
                description: `PayPal支付失败: ${error.message}`,
              })
            }}
          />
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="w-full"
            >
              返回
            </Button>
          </div>
        </Card>
      ) : showWeChatQR && weChatCodeUrl ? (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">微信扫码支付</h3>
          <div className="flex flex-col items-center space-y-4">
            <p className="text-sm text-muted-foreground">请使用微信扫描下方二维码完成支付</p>
            <div className="p-4 bg-white rounded-lg">
              <img
                src={getWeChatQRCodeUrl(weChatCodeUrl)}
                alt="微信支付二维码"
                className="w-48 h-48"
              />
            </div>
            <p className="text-xs text-muted-foreground">支付完成后，页面将自动刷新</p>
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWeChatQR(false)
                  setWeChatCodeUrl(null)
                }}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  router.refresh()
                }}
                className="flex-1"
              >
                刷新状态
              </Button>
            </div>
          </div>
        </Card>
      ) : showBankTransfer && bankAccountInfo ? (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">银行转账</h3>
          <div className="space-y-4">
            {/* Bank Account Information */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-semibold">收款账户信息</p>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">收款人：</span>{bankAccountInfo.account_name}</p>
                <p><span className="text-muted-foreground">账号：</span>{bankAccountInfo.account_number}</p>
                <p><span className="text-muted-foreground">开户行：</span>{bankAccountInfo.bank_name}</p>
                {bankAccountInfo.bank_branch && (
                  <p><span className="text-muted-foreground">开户行地址：</span>{bankAccountInfo.bank_branch}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>重要：</strong>转账时请在备注中填写订单号 <strong>{order.order_number}</strong>
                </p>
                {bankAccountInfo.notes && (
                  <p className="text-xs text-muted-foreground">{bankAccountInfo.notes}</p>
                )}
              </div>
            </div>

            {/* Transfer Details Form */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">转账银行</label>
                <input
                  type="text"
                  value={bankFormData.bankName}
                  onChange={(e) => setBankFormData({ ...bankFormData, bankName: e.target.value })}
                  placeholder="请输入您使用的银行名称"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">转账金额</label>
                <input
                  type="number"
                  value={bankFormData.transferAmount}
                  onChange={(e) => setBankFormData({ ...bankFormData, transferAmount: e.target.value })}
                  placeholder="请输入转账金额"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">交易流水号</label>
                <input
                  type="text"
                  value={bankFormData.transactionNumber}
                  onChange={(e) => setBankFormData({ ...bankFormData, transactionNumber: e.target.value })}
                  placeholder="请输入银行交易流水号（可选）"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">转账日期</label>
                <input
                  type="date"
                  value={bankFormData.transferDate}
                  onChange={(e) => setBankFormData({ ...bankFormData, transferDate: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Proof Upload */}
            <div>
              <label className="text-sm font-medium mb-2 block">上传转账凭证</label>
              {proofPreview ? (
                <div className="relative">
                  <img src={proofPreview} alt="凭证预览" className="w-full max-w-xs rounded-lg border" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setProofFile(null)
                      setProofPreview(null)
                    }}
                    className="mt-2"
                  >
                    重新选择
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:bg-accent">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">点击上传转账凭证图片</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setProofFile(file)
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setProofPreview(reader.result as string)
                        }
                        reader.readAsDataURL(file)
                      }
                    }}
                  />
                </label>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBankTransfer(false)
                  setBankAccountInfo(null)
                  setProofFile(null)
                  setProofPreview(null)
                }}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (!proofFile) {
                    toast({
                      variant: 'warning',
                      title: '提示',
                      description: '请上传转账凭证',
                    })
                    return
                  }

                  setUploadingProof(true)
                  try {
                    const formData = new FormData()
                    formData.append('orderId', orderId)
                    formData.append('image', proofFile)
                    formData.append('bankName', bankFormData.bankName)
                    formData.append('transactionNumber', bankFormData.transactionNumber)
                    formData.append('transferAmount', bankFormData.transferAmount)
                    formData.append('transferDate', bankFormData.transferDate)

                    const response = await fetch('/api/payments/bank/upload-proof', {
                      method: 'POST',
                      body: formData,
                    })

                    if (!response.ok) {
                      const error = await response.json()
                      throw new Error(error.error || '上传失败')
                    }

                    toast({
                      variant: 'success',
                      title: '成功',
                      description: '凭证上传成功，等待审核',
                    })
                    router.push(`/orders/${orderId}`)
                  } catch (error: any) {
                    toast({
                      variant: 'destructive',
                      title: '错误',
                      description: error.message || '上传失败',
                    })
                  } finally {
                    setUploadingProof(false)
                  }
                }}
                disabled={uploadingProof || !proofFile}
                className="flex-1"
              >
                {uploadingProof ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    上传中...
                  </>
                ) : (
                  '提交凭证'
                )}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={processing}
          >
            返回
          </Button>
          <Button
            onClick={handlePayment}
            disabled={processing}
            className="flex-1"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              `确认支付 ¥${order.total_amount.toFixed(2)}`
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
