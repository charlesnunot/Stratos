'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function DepositPaySuccessPage() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('deposit')
  const lotId = searchParams.get('lotId')
  const token = searchParams.get('token') // PayPal orderId on return
  const [verified, setVerified] = useState(false)
  const captureSent = useRef(false)

  const { data: lot, isLoading, refetch } = useQuery({
    queryKey: ['depositLot', lotId],
    queryFn: async () => {
      if (!lotId || !user) return null

      const { data, error } = await supabase
        .from('seller_deposit_lots')
        .select('*')
        .eq('id', lotId)
        .eq('seller_id', user.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!lotId && !!user,
    refetchInterval: token ? 2000 : false,
  })

  useEffect(() => {
    if (lot && lot.status === 'held') {
      setVerified(true)
    }
  }, [lot])

  useEffect(() => {
    if (!token || !user || captureSent.current) return
    captureSent.current = true
    fetch('/api/payments/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: token }),
    })
      .then((r) => (r.ok ? refetch() : Promise.resolve()))
      .catch(() => {})
  }, [token, user, refetch])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!lot || lot.status !== 'held') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <Card className="p-6">
          <h1 className="mb-4 text-2xl font-bold">{t('pay.success.verifying') || '验证支付中...'}</h1>
          <p className="text-muted-foreground">
            {t('pay.success.verifyingDesc') || '正在验证您的支付，请稍候...'}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('pay.success.title') || '支付成功'}</h1>
            <p className="text-muted-foreground">
              {t('pay.success.description') || '您的保证金已成功支付，商品销售功能已恢复。'}
            </p>
          </div>
        </div>

        <div className="space-y-2 mt-6">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('pay.success.amount') || '支付金额'}:</span>
            <span className="font-semibold">${lot.required_amount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('pay.success.status') || '状态'}:</span>
            <span className="font-semibold">{t('pay.success.held') || '已持有'}</span>
          </div>
        </div>
      </Card>

      <div className="flex gap-3">
        <Link href="/seller/dashboard" className="flex-1">
          <Button className="w-full">{t('pay.success.dashboard') || '返回卖家中心'}</Button>
        </Link>
        <Link href="/seller/products" className="flex-1">
          <Button variant="outline" className="w-full">
            {t('pay.success.products') || '管理商品'}
          </Button>
        </Link>
      </div>
    </div>
  )
}
