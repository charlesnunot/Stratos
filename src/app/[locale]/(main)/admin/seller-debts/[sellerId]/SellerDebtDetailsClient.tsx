'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { ArrowLeft } from 'lucide-react'

interface Debt {
  id: string
  debt_amount: number
  currency: string
  debt_reason: string
  status: string
  collection_method: string | null
  collected_at: string | null
  created_at: string
  order?: { id: string; order_number: string; total_amount: number; currency: string }
  dispute?: { id: string; dispute_type: string; status: string }
  refund?: { id: string; refund_amount: number; currency: string }
}

interface DepositLot {
  id: string
  required_amount: number
  currency: string
  status: string
  held_at: string | null
  metadata: unknown
}

export function SellerDebtDetailsClient({ sellerId }: { sellerId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [seller, setSeller] = useState<{ display_name?: string; username?: string } | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [statistics, setStatistics] = useState({
    totalDebt: 0,
    totalCollected: 0,
    totalPaid: 0,
    pendingDebtCount: 0,
    collectedDebtCount: 0,
    depositBalance: 0,
    depositLotsCount: 0,
  })
  const [depositLots, setDepositLots] = useState<DepositLot[]>([])

  useEffect(() => {
    if (sellerId) loadData()
  }, [sellerId])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/seller-debts/${sellerId}`)
      const data = await res.json()
      if (data.seller) setSeller(data.seller)
      if (data.debts) setDebts(data.debts)
      if (data.statistics) setStatistics(data.statistics)
      if (data.depositLots) setDepositLots(data.depositLots)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }

  const handleCollectFromDeposit = async () => {
    if (!confirm('确定要从保证金中扣除该卖家的债务吗？')) return
    try {
      const res = await fetch('/api/admin/seller-debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collect_from_deposit', sellerId }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`成功扣除 ${data.totalCollected} 的债务`)
        loadData()
      } else alert(`操作失败: ${data.error}`)
    } catch {
      alert('操作失败')
    }
  }

  const getStatusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'destructive', collected: 'default', paid: 'default', forgiven: 'secondary',
    }
    const l: Record<string, string> = {
      pending: '待偿还', collected: '已扣除', paid: '已支付', forgiven: '已免除',
    }
    return <Badge variant={v[status] || 'outline'}>{l[status] || status}</Badge>
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />返回
        </Button>
        <div>
          <h1 className="text-3xl font-bold">
            卖家债务详情: {seller?.display_name || seller?.username || sellerId}
          </h1>
          <p className="mt-2 text-muted-foreground">查看该卖家的详细债务信息和历史记录</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>待偿还债务</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(statistics.totalDebt, 'USD')}</div>
            <p className="text-xs text-muted-foreground">{statistics.pendingDebtCount} 笔待偿还</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>已扣除债务</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statistics.totalCollected, 'USD')}</div>
            <p className="text-xs text-muted-foreground">{statistics.collectedDebtCount} 笔已扣除</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>保证金余额</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statistics.depositBalance, 'USD')}</div>
            <p className="text-xs text-muted-foreground">{statistics.depositLotsCount} 个保证金批次</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>操作</CardDescription></CardHeader>
          <CardContent>
            <Button
              variant="default"
              size="sm"
              onClick={handleCollectFromDeposit}
              disabled={statistics.totalDebt === 0 || statistics.depositBalance === 0}
            >
              从保证金扣除
            </Button>
          </CardContent>
        </Card>
      </div>

      {depositLots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>保证金批次</CardTitle>
            <CardDescription>该卖家的保证金详情</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {depositLots.map((lot) => (
              <div key={lot.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{formatCurrency(lot.required_amount, (lot.currency as Currency) || 'USD')}</p>
                  <p className="text-sm text-muted-foreground">
                    状态: {lot.status} | 持有时间: {lot.held_at ? new Date(lot.held_at).toLocaleString('zh-CN') : 'N/A'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>债务历史记录</CardTitle>
          <CardDescription>该卖家的所有债务记录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {debts.map((debt) => (
            <Card key={debt.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">
                        {formatCurrency(debt.debt_amount, (debt.currency as Currency) || 'USD')}
                      </span>
                      {getStatusBadge(debt.status)}
                      {debt.collection_method && <Badge variant="outline">{debt.collection_method}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">原因: {debt.debt_reason}</p>
                    {debt.order && <p className="text-sm text-muted-foreground">订单: {debt.order.order_number}</p>}
                    <p className="text-sm text-muted-foreground">创建时间: {new Date(debt.created_at).toLocaleString('zh-CN')}</p>
                    {debt.collected_at && (
                      <p className="text-sm text-muted-foreground">扣除时间: {new Date(debt.collected_at).toLocaleString('zh-CN')}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {debts.length === 0 && <p className="py-8 text-center text-muted-foreground">暂无债务记录</p>}
        </CardContent>
      </Card>
    </div>
  )
}
