'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  TrendingUp, 
  Search, 
  Star, 
  HeadphonesIcon, 
  UserCircle,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react'

interface PromotionStatusProps {
  userId: string
}

interface PromotionData {
  tier: number
  isDirect: boolean
  subscriptionExpiresAt: string
  promotionWeight: {
    search_boost: number
    feed_priority: number
    homepage_featured: boolean
    featured_count: number
    boosted_views: number
  } | null
  benefits: {
    searchBoost: number
    feedPriority: number
    canBeFeatured: boolean
    prioritySupport: boolean
    dedicatedManager: boolean
  }
}

export function PromotionStatus({ userId }: PromotionStatusProps) {
  const { data, isLoading, error } = useQuery<PromotionData>({
    queryKey: ['seller-promotion', userId],
    queryFn: async () => {
      const response = await fetch('/api/seller/promotion')
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch promotion status')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>加载推广状态失败</AlertDescription>
      </Alert>
    )
  }

  const { tier, isDirect, subscriptionExpiresAt, promotionWeight, benefits } = data!

  const getTierName = () => {
    if (isDirect) return '直营卖家'
    if (tier >= 100) return 'Scale'
    if (tier >= 50) return 'Growth'
    if (tier >= 15) return 'Starter'
    return '免费'
  }

  const getTierColor = () => {
    if (isDirect) return 'bg-purple-500'
    if (tier >= 100) return 'bg-blue-500'
    if (tier >= 50) return 'bg-green-500'
    if (tier >= 15) return 'bg-yellow-500'
    return 'bg-gray-500'
  }

  return (
    <div className="space-y-6">
      {/* 当前档位卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>推广状态</CardTitle>
              <CardDescription>查看您的店铺推广权益</CardDescription>
            </div>
            <Badge className={`${getTierColor()} text-white`}>
              {getTierName()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscriptionExpiresAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              订阅到期: {new Date(subscriptionExpiresAt).toLocaleDateString('zh-CN')}
            </div>
          )}

          {/* 搜索权重 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">搜索排名提升</span>
              </div>
              <span className="text-sm font-medium">{((benefits.searchBoost - 1) * 100).toFixed(0)}%</span>
            </div>
            <Progress value={benefits.searchBoost * 50} className="h-2" />
          </div>

          {/* 信息流优先级 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">信息流优先级</span>
              </div>
              <span className="text-sm font-medium">{benefits.feedPriority}/100</span>
            </div>
            <Progress value={benefits.feedPriority} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* 权益列表 */}
      <Card>
        <CardHeader>
          <CardTitle>当前权益</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BenefitItem 
              icon={Star}
              title="首页推荐"
              description="您的商品有机会在首页展示"
              enabled={benefits.canBeFeatured}
            />
            <BenefitItem 
              icon={HeadphonesIcon}
              title="优先客服"
              description="更快的客服响应时间"
              enabled={benefits.prioritySupport}
            />
            <BenefitItem 
              icon={UserCircle}
              title="专属经理"
              description="一对一客户经理服务"
              enabled={benefits.dedicatedManager}
            />
            <BenefitItem 
              icon={TrendingUp}
              title="搜索加权"
              description="搜索结果排名提升"
              enabled={benefits.searchBoost > 1}
            />
          </div>
        </CardContent>
      </Card>

      {/* 推广统计 */}
      {promotionWeight && (
        <Card>
          <CardHeader>
            <CardTitle>推广统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{promotionWeight.featured_count || 0}</div>
                <div className="text-sm text-muted-foreground">被推荐次数</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{promotionWeight.boosted_views || 0}</div>
                <div className="text-sm text-muted-foreground">加权曝光</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface BenefitItemProps {
  icon: React.ElementType
  title: string
  description: string
  enabled: boolean
}

function BenefitItem({ icon: Icon, title, description, enabled }: BenefitItemProps) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${enabled ? 'bg-green-50' : 'bg-gray-50'}`}>
      <div className={`p-2 rounded-full ${enabled ? 'bg-green-100' : 'bg-gray-200'}`}>
        <Icon className={`h-4 w-4 ${enabled ? 'text-green-600' : 'text-gray-400'}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {enabled ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
