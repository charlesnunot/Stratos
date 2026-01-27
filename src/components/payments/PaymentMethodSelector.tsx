'use client'

import { CreditCard, Wallet, Smartphone, Building2, MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

interface PaymentMethod {
  id: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod['id'] | null
  onSelect: (method: PaymentMethod['id']) => void
  availableMethods?: PaymentMethod['id'][] // Optional: only show these payment methods (intersection for multi-seller orders)
  disabled?: boolean
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelect,
  availableMethods,
  disabled = false,
}: PaymentMethodSelectorProps) {
  const t = useTranslations('payments')
  const tSupport = useTranslations('support')
  
  const allPaymentMethods: PaymentMethod[] = [
    {
      id: 'stripe',
      name: t('stripe'),
      icon: CreditCard,
      description: t('stripeDescription'),
    },
    {
      id: 'paypal',
      name: t('paypal'),
      icon: Wallet,
      description: t('paypalDescription'),
    },
    {
      id: 'alipay',
      name: t('alipay'),
      icon: Smartphone,
      description: t('alipayDescription'),
    },
    {
      id: 'wechat',
      name: t('wechat'),
      icon: Smartphone,
      description: t('wechatDescription'),
    },
    {
      id: 'bank',
      name: t('bank'),
      icon: Building2,
      description: t('bankDescription'),
    },
  ]

  // Filter payment methods based on availableMethods prop
  const paymentMethods = availableMethods
    ? allPaymentMethods.filter(method => availableMethods.includes(method.id))
    : allPaymentMethods

  // If no available methods, show message and contact support link
  if (paymentMethods.length === 0) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-3">
        <p className="text-sm text-destructive">
          {t('noPaymentMethodsAvailable') || 'No payment methods available for this order. Please contact support.'}
        </p>
        <Link href="/support/tickets/create">
          <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10">
            <MessageSquare className="mr-2 h-4 w-4" />
            {tSupport('contactSupport')}
          </Button>
        </Link>
      </div>
    )
  }
  
  return (
    <div className="space-y-2">
      {paymentMethods.map((method) => {
        const Icon = method.icon
        const isSelected = selectedMethod !== null && selectedMethod === method.id
        const isDisabled = disabled || false

        return (
          <Card
            key={method.id}
            className={cn(
              'p-4 transition-colors',
              isDisabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-accent',
              isSelected && 'border-primary bg-primary/5'
            )}
            onClick={() => !isDisabled && onSelect(method.id)}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{method.name}</p>
                <p className="text-sm text-muted-foreground">
                  {method.description}
                </p>
              </div>
              <input
                type="radio"
                name="payment-method"
                checked={isSelected}
                onChange={() => onSelect(method.id)}
                className="h-4 w-4"
              />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
