/**
 * Admin platform fees management – client UI.
 * Auth enforced by Server Component wrapper.
 */

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
import { DollarSign, Search, CheckCircle, XCircle, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

interface PlatformFeeTransaction {
  id: string
  related_id: string
  amount: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
  metadata: {
    type: string
    reason: string
    charged_by: string
    charged_at: string
  }
  user?: {
    id: string
    display_name: string
    username: string
  }
}

export function AdminPlatformFeesClient() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<PlatformFeeTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(true)
  const [searchUserId, setSearchUserId] = useState('')

  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [reason, setReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadTransactions()
  }, [])

  const loadTransactions = async () => {
    setLoadingTransactions(true)
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          id,
          related_id,
          amount,
          currency,
          status,
          paid_at,
          created_at,
          metadata
        `)
        .contains('metadata', { type: 'platform_fee' })
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      const transactionsWithUsers = await Promise.all(
        (data || []).map(async (tx) => {
          const { data: userData } = await supabase
            .from('profiles')
            .select('id, display_name, username')
            .eq('id', tx.related_id)
            .single()

          return {
            ...tx,
            user: userData || undefined,
          }
        })
      )

      setTransactions(transactionsWithUsers as PlatformFeeTransaction[])
    } catch (err: unknown) {
      if (typeof err === 'object' && err && 'message' in err) {
        console.error('Error loading transactions:', err)
      }
    } finally {
      setLoadingTransactions(false)
    }
  }

  const handleCharge = async () => {
    if (!userId || !amount || !reason || !paymentMethod) {
      alert('请填写所有必填字段')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/platform-fees/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          currency,
          reason,
          paymentMethod,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to charge platform fee')
      }

      if (result.requiresManualProcessing) {
        alert(result.message || '银行转账需要手动处理')
        setShowForm(false)
        loadTransactions()
        return
      }

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl
      } else if (result.formAction && result.formData) {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = result.formAction
        Object.entries(result.formData).forEach(([key, value]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = key
          input.value = value as string
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
      } else if (result.codeUrl) {
        alert('微信支付二维码已生成，请在支付完成后刷新页面')
        setShowForm(false)
        loadTransactions()
      } else {
        alert('平台服务费已创建')
        setShowForm(false)
        loadTransactions()
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '收取平台服务费失败')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />已支付</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="h-3 w-3 mr-1" />待支付</Badge>
      case 'failed':
        return <Badge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" />失败</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const filteredTransactions = transactions.filter((tx) => {
    if (!searchUserId) return true
    return (
      tx.related_id.toLowerCase().includes(searchUserId.toLowerCase()) ||
      tx.user?.display_name?.toLowerCase().includes(searchUserId.toLowerCase()) ||
      tx.user?.username?.toLowerCase().includes(searchUserId.toLowerCase())
    )
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">平台服务费管理</h1>
          <p className="mt-1 text-muted-foreground">收取和管理平台服务费</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <DollarSign className="mr-2 h-4 w-4" />
          {showForm ? '取消' : '收取服务费'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>收取平台服务费</CardTitle>
            <CardDescription>向用户收取平台服务费</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="userId">用户ID *</Label>
                <Input
                  id="userId"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="输入用户ID"
                />
              </div>
              <div>
                <Label htmlFor="amount">金额 *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="currency">币种</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="paymentMethod">支付方式 *</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="alipay">支付宝</SelectItem>
                    <SelectItem value="wechat">微信支付</SelectItem>
                    <SelectItem value="bank">银行转账</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="reason">原因 *</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="输入收费原因"
              />
            </div>
            <Button onClick={handleCharge} disabled={loading} className="w-full">
              {loading ? '处理中...' : '创建支付'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>服务费记录</CardTitle>
          <CardDescription>查看所有平台服务费收取记录</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户ID、用户名..."
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {loadingTransactions ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无记录</div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {tx.user?.display_name || tx.user?.username || tx.related_id}
                      </p>
                      <p className="text-sm text-muted-foreground">{tx.metadata?.reason || '平台服务费'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatCurrency(tx.amount, tx.currency as Currency)}</p>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>创建时间: {new Date(tx.created_at).toLocaleString('zh-CN')}</span>
                    {tx.paid_at && (
                      <span>支付时间: {new Date(tx.paid_at).toLocaleString('zh-CN')}</span>
                    )}
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
