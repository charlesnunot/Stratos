'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Search, CheckCircle, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

interface ViolationRecord {
  id: string
  seller_id: string
  violation_type: string
  violation_reason: string
  penalty_amount: number
  currency: string
  status: string
  deducted_at: string | null
  created_at: string
  seller?: { id: string; display_name: string; username: string }
}

export function AdminViolationPenaltiesClient() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [violations, setViolations] = useState<ViolationRecord[]>([])
  const [loadingViolations, setLoadingViolations] = useState(true)
  const [searchSellerId, setSearchSellerId] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('CNY')
  const [violationType, setViolationType] = useState('')
  const [violationReason, setViolationReason] = useState('')
  const [relatedOrderId, setRelatedOrderId] = useState('')
  const [relatedDisputeId, setRelatedDisputeId] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadViolations()
  }, [])

  const loadViolations = async () => {
    setLoadingViolations(true)
    try {
      const { data, error } = await supabase
        .from('seller_violations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        const { data: depositData } = await supabase
          .from('seller_deposit_lots')
          .select('id, seller_id, metadata, created_at')
          .contains('metadata', { deduction_reason: '违规扣款' })
          .order('created_at', { ascending: false })
          .limit(100)

        if (depositData) {
          const mapped = depositData.map((lot: any) => ({
            id: lot.id,
            seller_id: lot.seller_id,
            violation_type: lot.metadata?.violation_type || 'unknown',
            violation_reason: lot.metadata?.deduction_reason || '违规扣款',
            penalty_amount: lot.metadata?.deduction_amount || 0,
            currency: lot.metadata?.currency || 'CNY',
            status: 'completed',
            deducted_at: lot.metadata?.deducted_at || null,
            created_at: lot.created_at,
          }))
          setViolations(mapped as ViolationRecord[])
        }
        return
      }

      const withSellers = await Promise.all(
        (data || []).map(async (v) => {
          const { data: s } = await supabase
            .from('profiles')
            .select('id, display_name, username')
            .eq('id', v.seller_id)
            .single()
          return { ...v, seller: s || undefined }
        })
      )
      setViolations(withSellers as ViolationRecord[])
    } catch {
      /* noop */
    } finally {
      setLoadingViolations(false)
    }
  }

  const handleDeduct = async () => {
    if (!sellerId || !amount || !violationType || !violationReason) {
      alert('请填写所有必填字段')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/violation-penalties/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          amount: parseFloat(amount),
          currency,
          violationType,
          violationReason,
          relatedOrderId: relatedOrderId || undefined,
          relatedDisputeId: relatedDisputeId || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to deduct')
      if (result.success) {
        alert(`违规扣款成功！扣除金额: ${formatCurrency(result.deductedAmount, result.deductedAmountCurrency)}，剩余保证金: ${formatCurrency(result.remainingBalance, result.deductedAmountCurrency)}`)
        setShowForm(false)
        setSellerId('')
        setAmount('')
        setViolationType('')
        setViolationReason('')
        setRelatedOrderId('')
        setRelatedDisputeId('')
        loadViolations()
      } else throw new Error(result.error || '扣款失败')
    } catch (e: any) {
      alert(e?.message || '违规扣款失败')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />已完成</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500">待处理</Badge>
      case 'failed':
        return <Badge className="bg-red-500"><XCircle className="mr-1 h-3 w-3" />失败</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const filtered = violations.filter((v) => {
    if (!searchSellerId) return true
    return (
      v.seller_id.toLowerCase().includes(searchSellerId.toLowerCase()) ||
      v.seller?.display_name?.toLowerCase().includes(searchSellerId.toLowerCase()) ||
      v.seller?.username?.toLowerCase().includes(searchSellerId.toLowerCase())
    )
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">违规扣款管理</h1>
          <p className="mt-1 text-muted-foreground">从卖家保证金中扣除违规罚款</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          {showForm ? '取消' : '执行扣款'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>执行违规扣款</CardTitle>
            <CardDescription>从卖家保证金中扣除违规罚款</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="sellerId">卖家ID *</Label>
                <Input id="sellerId" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="输入卖家ID" />
              </div>
              <div>
                <Label htmlFor="amount">扣款金额 *</Label>
                <Input id="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label htmlFor="currency">币种</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="violationType">违规类型 *</Label>
                <Select value={violationType} onValueChange={setViolationType}>
                  <SelectTrigger><SelectValue placeholder="选择违规类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fraud">欺诈行为</SelectItem>
                    <SelectItem value="quality">质量问题</SelectItem>
                    <SelectItem value="shipping">物流问题</SelectItem>
                    <SelectItem value="service">服务问题</SelectItem>
                    <SelectItem value="policy">违反政策</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="relatedOrderId">关联订单ID（可选）</Label>
                <Input id="relatedOrderId" value={relatedOrderId} onChange={(e) => setRelatedOrderId(e.target.value)} placeholder="输入订单ID" />
              </div>
              <div>
                <Label htmlFor="relatedDisputeId">关联争议ID（可选）</Label>
                <Input id="relatedDisputeId" value={relatedDisputeId} onChange={(e) => setRelatedDisputeId(e.target.value)} placeholder="输入争议ID" />
              </div>
            </div>
            <div>
              <Label htmlFor="violationReason">违规原因 *</Label>
              <Input id="violationReason" value={violationReason} onChange={(e) => setViolationReason(e.target.value)} placeholder="详细描述违规原因" />
            </div>
            <Button onClick={handleDeduct} disabled={loading} className="w-full">
              {loading ? '处理中...' : '执行扣款'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>扣款记录</CardTitle>
          <CardDescription>查看所有违规扣款记录</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="搜索卖家ID、用户名..." value={searchSellerId} onChange={(e) => setSearchSellerId(e.target.value)} className="pl-8" />
            </div>
          </div>
          {loadingViolations ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无记录</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((v) => (
                <div key={v.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{v.seller?.display_name || v.seller?.username || v.seller_id}</p>
                      <p className="text-sm text-muted-foreground">{v.violation_type} - {v.violation_reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">-{formatCurrency(v.penalty_amount, v.currency as Currency)}</p>
                      {getStatusBadge(v.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>创建时间: {new Date(v.created_at).toLocaleString('zh-CN')}</span>
                    {v.deducted_at && <span>扣款时间: {new Date(v.deducted_at).toLocaleString('zh-CN')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
