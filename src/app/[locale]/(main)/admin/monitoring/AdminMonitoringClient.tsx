'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, AlertTriangle, Activity, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'

interface MonitoringData {
  metrics: {
    orders: {
      total: number
      last24h: number
      pending: number
      expired: number
    }
    users: {
      total: number
      activeSellers: number
    }
    revenue: {
      total: number
      last24h: number
    }
    issues: {
      pendingRefunds: number
      activeDisputes: number
      pendingDeposits: number
    }
    cronJobs: Record<string, {
      lastExecution: string
      lastStatus: string
      executionTime: number
      successCount: number
      failureCount: number
    }>
  }
  health: {
    overall: 'healthy' | 'warning' | 'critical'
    issues: string[]
  }
  timestamp: string
}

interface AdminMonitoringClientProps {
  initialData: MonitoringData | null
  initialError: string | null
}

export function AdminMonitoringClient({ initialData, initialError }: AdminMonitoringClientProps) {
  const [data, setData] = useState<MonitoringData | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/monitoring/dashboard')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load monitoring data')
      }

      if (result.success) {
        setData(result)
        setLastRefresh(new Date())
      } else {
        throw new Error(result.error || 'Failed to load monitoring data')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load monitoring data')
    } finally {
      setLoading(false)
    }
  }

  const getHealthBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />健康</Badge>
      case 'warning':
        return <Badge className="bg-yellow-500"><AlertTriangle className="h-3 w-3 mr-1" />警告</Badge>
      case 'critical':
        return <Badge className="bg-red-500"><AlertCircle className="h-3 w-3 mr-1" />严重</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getCronStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500">成功</Badge>
      case 'failed':
        return <Badge className="bg-red-500">失败</Badge>
      case 'running':
        return <Badge className="bg-blue-500">运行中</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (loading && !data) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>加载监控数据中...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">加载失败</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">{error}</p>
            <Button onClick={loadData}>重试</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">系统监控</h1>
          <p className="text-muted-foreground mt-1">
            最后更新: {new Date(data.timestamp).toLocaleString('zh-CN')}
          </p>
        </div>
        <Button onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* System Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            系统健康状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            {getHealthBadge(data.health.overall)}
            <span className="text-sm text-muted-foreground">
              {data.health.issues.length === 0 ? '系统运行正常' : `${data.health.issues.length} 个问题`}
            </span>
          </div>
          {data.health.issues.length > 0 && (
            <div className="space-y-2">
              {data.health.issues.map((issue, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>总订单数</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.metrics.orders.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              过去24小时: {data.metrics.orders.last24h}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>待处理订单</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data.metrics.orders.pending.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              过期订单: {data.metrics.orders.expired}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>总用户数</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.metrics.users.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              活跃卖家: {data.metrics.users.activeSellers}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>总收入</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.metrics.revenue.total, 'USD')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              过去24小时: {formatCurrency(data.metrics.revenue.last24h, 'USD')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Issues */}
      <Card>
        <CardHeader>
          <CardTitle>待处理问题</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">待处理退款</p>
              <p className="text-2xl font-bold text-yellow-600">
                {data.metrics.issues.pendingRefunds}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">活跃争议</p>
              <p className="text-2xl font-bold text-orange-600">
                {data.metrics.issues.activeDisputes}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">待处理保证金</p>
              <p className="text-2xl font-bold text-blue-600">
                {data.metrics.issues.pendingDeposits}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cron Jobs Status */}
      <Card>
        <CardHeader>
          <CardTitle>定时任务状态</CardTitle>
          <CardDescription>过去24小时的执行情况</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(data.metrics.cronJobs).length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无定时任务执行记录</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.metrics.cronJobs).map(([jobName, status]) => (
                <div key={jobName} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{jobName}</span>
                      {getCronStatusBadge(status.lastStatus)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(status.lastExecution).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">执行时间: </span>
                      <span>{status.executionTime}ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">成功: </span>
                      <span className="text-green-600">{status.successCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">失败: </span>
                      <span className="text-red-600">{status.failureCount}</span>
                    </div>
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
