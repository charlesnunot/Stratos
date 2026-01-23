'use client'

import { CreditCard, Wallet, Smartphone, Building2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface PaymentMethod {
  id: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod['id']
  onSelect: (method: PaymentMethod['id']) => void
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelect,
}: PaymentMethodSelectorProps) {
  const t = useTranslations('payments')
  
  const paymentMethods: PaymentMethod[] = [
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
  
  return (
    <div className="space-y-2">
      {paymentMethods.map((method) => {
        const Icon = method.icon
        const isSelected = selectedMethod === method.id

        return (
          <Card
            key={method.id}
            className={cn(
              'cursor-pointer p-4 transition-colors hover:bg-accent',
              isSelected && 'border-primary bg-primary/5'
            )}
            onClick={() => onSelect(method.id)}
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
