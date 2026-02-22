'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Package, 
  DollarSign,
  AlertCircle,
  Download,
  Calendar
} from 'lucide-react'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts'

interface AdvancedAnalyticsProps {
  userId: string
  subscriptionTier: number
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function AdvancedAnalytics({ userId, subscriptionTier }: AdvancedAnalyticsProps) {
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  
  const [activeTab, setActiveTab] = useState('overview')
  const [dateRange, setDateRange] = useState(30)

  // Check if user has access (Scale tier only)
  const hasAccess = subscriptionTier >= 100

  // Fetch analytics data
  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['seller-analytics', userId, dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/seller/analytics?days=${dateRange}&type=full`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch analytics')
      }
      return response.json()
    },
    enabled: hasAccess,
  })

  const exportReport = async () => {
    try {
      const response = await fetch(`/api/seller/analytics?days=${dateRange}&type=full`)
      const data = await response.json()
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: tCommon('success'),
        description: '报告导出成功',
      })
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    }
  }

  if (!hasAccess) {
    return (
      <Card className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            高级数据分析报告仅对 Scale 档位卖家开放。
            请升级您的订阅以使用此功能。
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          加载数据失败，请稍后重试
        </AlertDescription>
      </Alert>
    )
  }

  const { salesTrend, productPerformance, customerInsights, revenueAnalytics } = analytics || {}

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">高级数据分析</h2>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="border rounded px-3 py-2"
          >
            <option value={7}>最近7天</option>
            <option value={30}>最近30天</option>
            <option value={90}>最近90天</option>
          </select>
          <Button variant="outline" onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />
            导出报告
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总营收</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${revenueAnalytics?.totalRevenue?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              本月: ${revenueAnalytics?.thisMonthRevenue?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {revenueAnalytics?.totalOrders || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              本月: {revenueAnalytics?.thisMonthOrders || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">客户数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customerInsights?.totalCustomers || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              回头客: {customerInsights?.repeatCustomers || 0} ({customerInsights?.repeatRate || 0}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">增长率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Number(revenueAnalytics?.growthRate) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Number(revenueAnalytics?.growthRate) >= 0 ? '+' : ''}{revenueAnalytics?.growthRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              环比上月
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="sales">销售趋势</TabsTrigger>
          <TabsTrigger value="products">商品表现</TabsTrigger>
          <TabsTrigger value="customers">客户分析</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>销售趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#8884d8" name="营收" />
                  <Line type="monotone" dataKey="orders" stroke="#82ca9d" name="订单数" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>每日销售详情</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={salesTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#8884d8" name="营收" />
                  <Bar dataKey="orders" fill="#82ca9d" name="订单数" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>热门商品 TOP 10</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={productPerformance?.slice(0, 10) || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="likes" fill="#8884d8" name="点赞" />
                  <Bar dataKey="wants" fill="#82ca9d" name="想要" />
                  <Bar dataKey="orderCount" fill="#ffc658" name="订单" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>客户地域分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={customerInsights?.countryDistribution || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: { name?: string; percent?: number }) => `${props.name || ''} ${((props.percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="country"
                    >
                      {(customerInsights?.countryDistribution || []).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>客户统计</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">总客户数</p>
                  <p className="text-2xl font-bold">{customerInsights?.totalCustomers || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">回头客</p>
                  <p className="text-2xl font-bold">{customerInsights?.repeatCustomers || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">复购率</p>
                  <p className="text-2xl font-bold">{customerInsights?.repeatRate || 0}%</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
