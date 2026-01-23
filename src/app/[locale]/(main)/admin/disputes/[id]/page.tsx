/**
 * Admin dispute resolution page
 * Allows admins to view dispute details and make resolution decisions
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react'

export default function AdminDisputePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const [dispute, setDispute] = useState<any>(null)
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<'original_payment' | 'platform_refund'>('platform_refund')

  useEffect(() => {
    if (!user) return
    loadDispute()
  }, [user, params.id])

  const loadDispute = async () => {
    setLoading(true)
    try {
      // Check admin access
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        router.push('/')
        return
      }

      // Load dispute with order details
      const { data: disputeData, error: disputeError } = await supabase
        .from('order_disputes')
        .select(`
          *,
          orders!inner(
            *,
            buyer:profiles!orders_buyer_id_fkey(id, username, display_name),
            seller:profiles!orders_seller_id_fkey(id, username, display_name)
          )
        `)
        .eq('id', params.id)
        .single()

      if (disputeError) throw disputeError

      setDispute(disputeData)
      setOrder((disputeData.orders as any))
      setRefundAmount((disputeData.orders as any).total_amount?.toString() || '')
    } catch (error: any) {
      console.error('Error loading dispute:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '加载纠纷详情失败',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async () => {
    if (!resolution.trim()) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '请输入处理结果',
      })
      return
    }

    setResolving(true)
    try {
      const response = await fetch('/api/admin/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId: params.id,
          resolution,
          refundAmount: refundAmount ? parseFloat(refundAmount) : null,
          refundMethod,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '处理失败')
      }

      toast({
        variant: 'success',
        title: '成功',
        description: '纠纷已处理',
      })

      router.push('/admin/orders')
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '处理纠纷失败',
      })
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!dispute || !order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">纠纷不存在</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <h1 className="text-3xl font-bold">处理纠纷</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>订单信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="font-semibold">订单号:</span> {order.order_number}
            </p>
            <p>
              <span className="font-semibold">金额:</span>{' '}
              {formatCurrency(order.total_amount, (order.currency as Currency) || 'USD')}
            </p>
            <p>
              <span className="font-semibold">买家:</span>{' '}
              {order.buyer?.display_name || order.buyer?.username || 'Unknown'}
            </p>
            <p>
              <span className="font-semibold">卖家:</span>{' '}
              {order.seller?.display_name || order.seller?.username || 'Unknown'}
            </p>
            <p>
              <span className="font-semibold">支付状态:</span>{' '}
              <Badge>{order.payment_status}</Badge>
            </p>
            <p>
              <span className="font-semibold">订单状态:</span>{' '}
              <Badge>{order.order_status}</Badge>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>纠纷信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="font-semibold">类型:</span>{' '}
              <Badge variant="outline">{dispute.dispute_type}</Badge>
            </p>
            <p>
              <span className="font-semibold">状态:</span>{' '}
              <Badge variant={dispute.status === 'pending' ? 'destructive' : 'secondary'}>
                {dispute.status}
              </Badge>
            </p>
            <p>
              <span className="font-semibold">发起人:</span> {dispute.initiated_by_type}
            </p>
            <p>
              <span className="font-semibold">原因:</span> {dispute.reason}
            </p>
            {dispute.seller_response && (
              <p>
                <span className="font-semibold">卖家回应:</span> {dispute.seller_response}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {dispute.evidence && dispute.evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>证据材料</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              {(dispute.evidence as string[]).map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Evidence ${index + 1}`}
                  className="rounded-md border"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>处理决定</CardTitle>
          <CardDescription>输入处理结果和退款信息（如需要）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="resolution">处理结果 *</Label>
            <Textarea
              id="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="输入处理决定和理由..."
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="refundAmount">退款金额（如需要）</Label>
            <Input
              id="refundAmount"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
            />
          </div>

          <div>
            <Label htmlFor="refundMethod">退款方式</Label>
            <select
              id="refundMethod"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="original_payment">原支付方式退款</option>
              <option value="platform_refund">平台垫付退款</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleResolve} disabled={resolving || !resolution.trim()}>
              {resolving ? '处理中...' : '确认处理'}
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
