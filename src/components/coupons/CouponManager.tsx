'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Plus, Copy, Tag, Calendar, Percent, DollarSign, Truck } from 'lucide-react'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'

interface Coupon {
  id: string
  code: string
  title: string
  description?: string
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping'
  discount_value: number
  min_order_amount?: number
  max_discount_amount?: number
  max_uses?: number
  max_uses_per_user: number
  used_count: number
  valid_from: string
  valid_until: string
  is_active: boolean
  total_usages?: number
  total_discount_given?: number
}

interface CouponManagerProps {
  userId: string
  subscriptionTier: number
}

export function CouponManager({ userId, subscriptionTier }: CouponManagerProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // Check if user has access
  const hasAccess = subscriptionTier >= 50
  const maxCoupons = subscriptionTier === 100 ? 20 : 10

  // Fetch coupons
  const { data: coupons, isLoading } = useQuery({
    queryKey: ['sellerCoupons', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_coupon_stats')
        .select('*')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as Coupon[]
    },
    enabled: hasAccess,
  })

  // Create coupon mutation
  const createMutation = useMutation({
    mutationFn: async (couponData: any) => {
      const response = await fetch('/api/seller/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(couponData),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create coupon')
      }
      return data.coupon
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellerCoupons', userId] })
      setIsCreateDialogOpen(false)
      toast({
        title: tCommon('success'),
        description: '优惠券创建成功',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message,
      })
    },
  })

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast({
      title: tCommon('success'),
      description: '优惠码已复制到剪贴板',
    })
  }

  const getDiscountLabel = (coupon: Coupon) => {
    switch (coupon.discount_type) {
      case 'percentage':
        return `${coupon.discount_value}% 折扣`
      case 'fixed_amount':
        return `$${coupon.discount_value} 折扣`
      case 'free_shipping':
        return '免运费'
      default:
        return ''
    }
  }

  const getDiscountIcon = (type: string) => {
    switch (type) {
      case 'percentage':
        return <Percent size={16} />
      case 'fixed_amount':
        return <DollarSign size={16} />
      case 'free_shipping':
        return <Truck size={16} />
      default:
        return <Tag size={16} />
    }
  }

  const isExpired = (validUntil: string) => {
    return new Date(validUntil) < new Date()
  }

  const activeCoupons = coupons?.filter(c => c.is_active && !isExpired(c.valid_until)) || []
  const expiredCoupons = coupons?.filter(c => !c.is_active || isExpired(c.valid_until)) || []

  if (!hasAccess) {
    return (
      <Card className="p-6">
        <Alert>
          <AlertDescription>
            优惠券功能仅对 Growth 和 Scale 档位卖家开放。
            请升级您的订阅以使用此功能。
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">优惠券管理</h2>
          <p className="text-sm text-muted-foreground">
            已创建 {activeCoupons.length} / {maxCoupons} 个有效优惠券
          </p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          disabled={activeCoupons.length >= maxCoupons}
        >
          <Plus size={16} className="mr-2" />
          创建优惠券
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="mb-4">
          <TabsTrigger value="active">
            有效 ({activeCoupons.length})
          </TabsTrigger>
          <TabsTrigger value="expired">
            已过期 ({expiredCoupons.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" />
            </div>
          ) : activeCoupons.length === 0 ? (
            <Alert>
              <AlertDescription>
                暂无有效优惠券。点击上方按钮创建您的第一个优惠券。
              </AlertDescription>
            </Alert>
          ) : (
            activeCoupons.map((coupon) => (
              <CouponCard
                key={coupon.id}
                coupon={coupon}
                onCopy={() => copyCode(coupon.code)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="expired" className="space-y-4">
          {expiredCoupons.map((coupon) => (
            <CouponCard
              key={coupon.id}
              coupon={coupon}
              onCopy={() => copyCode(coupon.code)}
              isExpired
            />
          ))}
        </TabsContent>
      </Tabs>

      <CreateCouponDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />
    </Card>
  )
}

function CouponCard({ coupon, onCopy, isExpired }: { coupon: Coupon; onCopy: () => void; isExpired?: boolean }) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className={`p-4 border rounded-lg ${isExpired ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{coupon.title}</h3>
            {isExpired && <Badge variant="secondary">已过期</Badge>}
          </div>
          
          <p className="text-sm text-muted-foreground mb-2">
            {coupon.description}
          </p>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              {getDiscountIcon(coupon.discount_type)}
              <span className="font-medium">{getDiscountLabel(coupon)}</span>
            </div>
            
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar size={14} />
              <span>{formatDate(coupon.valid_from)} - {formatDate(coupon.valid_until)}</span>
            </div>
          </div>

          {coupon.total_usages !== undefined && (
            <div className="mt-2 text-sm text-muted-foreground">
              已使用 {coupon.total_usages} 次
              {coupon.total_discount_given !== undefined && (
                <span> · 共优惠 ${coupon.total_discount_given.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <code className="px-3 py-1 bg-primary/10 text-primary rounded font-mono text-lg">
            {coupon.code}
          </code>
          <Button variant="ghost" size="sm" onClick={onCopy}>
            <Copy size={14} className="mr-1" />
            复制
          </Button>
        </div>
      </div>
    </div>
  )
}

function CreateCouponDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: any) => void
  isLoading: boolean
}) {
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    description: '',
    discount_type: 'percentage' as const,
    discount_value: 10,
    min_order_amount: '',
    max_discount_amount: '',
    max_uses: '',
    max_uses_per_user: 1,
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      discount_value: Number(formData.discount_value),
      min_order_amount: formData.min_order_amount ? Number(formData.min_order_amount) : undefined,
      max_discount_amount: formData.max_discount_amount ? Number(formData.max_discount_amount) : undefined,
      max_uses: formData.max_uses ? Number(formData.max_uses) : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建优惠券</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">优惠码 *</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="SUMMER2024"
              required
              pattern="[A-Z0-9]{3,20}"
              title="3-20位字母或数字"
            />
            <p className="text-xs text-muted-foreground">3-20位字母或数字，不区分大小写</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">标题 *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="夏季大促销"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="限时优惠，全场通用"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discount_type">折扣类型 *</Label>
              <select
                id="discount_type"
                value={formData.discount_type}
                onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as any })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
              >
                <option value="percentage">百分比折扣</option>
                <option value="fixed_amount">固定金额</option>
                <option value="free_shipping">免运费</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount_value">
                {formData.discount_type === 'percentage' ? '折扣百分比 *' : 
                 formData.discount_type === 'fixed_amount' ? '折扣金额 *' : '免运费'}
              </Label>
              {String(formData.discount_type) !== 'free_shipping' && (
                <Input
                  id="discount_value"
                  type="number"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: Number(e.target.value) })}
                  min={1}
                  max={(formData.discount_type as string) === 'percentage' ? 100 : undefined}
                  required
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_order_amount">最低订单金额</Label>
              <Input
                id="min_order_amount"
                type="number"
                value={formData.min_order_amount}
                onChange={(e) => setFormData({ ...formData, min_order_amount: e.target.value })}
                placeholder="无限制"
                min={0}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_discount_amount">最大折扣金额</Label>
              <Input
                id="max_discount_amount"
                type="number"
                value={formData.max_discount_amount}
                onChange={(e) => setFormData({ ...formData, max_discount_amount: e.target.value })}
                placeholder="无限制"
                min={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_uses">总使用次数限制</Label>
              <Input
                id="max_uses"
                type="number"
                value={formData.max_uses}
                onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                placeholder="无限制"
                min={1}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_uses_per_user">每用户限制 *</Label>
              <Input
                id="max_uses_per_user"
                type="number"
                value={formData.max_uses_per_user}
                onChange={(e) => setFormData({ ...formData, max_uses_per_user: Number(e.target.value) })}
                min={1}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valid_from">开始日期 *</Label>
              <Input
                id="valid_from"
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valid_until">结束日期 *</Label>
              <Input
                id="valid_until"
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getDiscountIcon(type: string) {
  switch (type) {
    case 'percentage':
      return <Percent size={16} />
    case 'fixed_amount':
      return <DollarSign size={16} />
    case 'free_shipping':
      return <Truck size={16} />
    default:
      return <Tag size={16} />
  }
}

function getDiscountLabel(coupon: Coupon) {
  switch (coupon.discount_type) {
    case 'percentage':
      return `${coupon.discount_value}% 折扣`
    case 'fixed_amount':
      return `$${coupon.discount_value} 折扣`
    case 'free_shipping':
      return '免运费'
    default:
      return ''
  }
}
