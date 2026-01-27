'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Debt {
  id: string
  seller_id: string
  order_id: string | null
  dispute_id: string | null
  refund_id: string | null
  debt_amount: number
  currency: string
  debt_reason: string
  status: 'pending' | 'paid' | 'collected' | 'forgiven'
  collection_method: string | null
  collected_at: string | null
  created_at: string
  seller?: { id: string; username: string; display_name: string }
  order?: { id: string; order_number: string; total_amount: number; currency: string }
  dispute?: { id: string; dispute_type: string; status: string }
  refund?: { id: string; refund_amount: number; currency: string }
}

export function AdminSellerDebtsClient() {
  const router = useRouter()
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ total: 0, pending: 0, collected: 0, totalPendingAmount: 0 })
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchSellerId, setSearchSellerId] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.append('status', filterStatus)
      if (searchSellerId) params.append('sellerId', searchSellerId)
      const res = await fetch(`/api/admin/seller-debts?${params.toString()}`)
      const data = await res.json()
      if (data.debts) setDebts(data.debts)
      if (data.summary) setSummary(data.summary)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [filterStatus, searchSellerId])

  const handleCollectFromDeposit = async (sellerId: string) => {
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
      <div>
        <h1 className="text-3xl font-bold">卖家债务管理</h1>
        <p className="mt-2 text-muted-foreground">查看和管理所有卖家债务</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>总债务数</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>待偿还</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.pending}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.totalPendingAmount, 'USD')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>已扣除</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.collected}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>操作</CardDescription></CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const sellers = Array.from(new Set(debts.map((d) => d.seller_id)))
                sellers.forEach((id) => handleCollectFromDeposit(id))
              }}
            >
              批量从保证金扣除
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>筛选</CardTitle></CardHeader>
        <CardContent className="flex gap-4">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="选择状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="pending">待偿还</SelectItem>
              <SelectItem value="collected">已扣除</SelectItem>
              <SelectItem value="paid">已支付</SelectItem>
              <SelectItem value="forgiven">已免除</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="搜索卖家ID" value={searchSellerId} onChange={(e) => setSearchSellerId(e.target.value)} className="max-w-xs" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>债务列表</CardTitle>
          <CardDescription>所有卖家债务记录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {debts.map((debt) => (
            <Card key={debt.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        卖家: {debt.seller?.display_name || debt.seller?.username || debt.seller_id}
                      </span>
                      {getStatusBadge(debt.status)}
                      {debt.collection_method && <Badge variant="outline">{debt.collection_method}</Badge>}
                    </div>
                    <div className="text-sm">
                      <p className="text-lg font-semibold">金额: {formatCurrency(debt.debt_amount, (debt.currency as Currency) || 'USD')}</p>
                      <p className="text-muted-foreground">原因: {debt.debt_reason}</p>
                      {debt.order && <p className="text-muted-foreground">订单: {debt.order.order_number}</p>}
                      <p className="text-muted-foreground">创建时间: {new Date(debt.created_at).toLocaleString('zh-CN')}</p>
                      {debt.collected_at && <p className="text-muted-foreground">扣除时间: {new Date(debt.collected_at).toLocaleString('zh-CN')}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {debt.status === 'pending' && (
                      <Button variant="outline" size="sm" onClick={() => handleCollectFromDeposit(debt.seller_id)}>
                        从保证金扣除
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => router.push(`/admin/seller-debts/${debt.seller_id}`)}>
                      <Eye className="mr-2 h-4 w-4" />查看详情
                    </Button>
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
