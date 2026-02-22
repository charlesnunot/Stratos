'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Clock,
  Activity,
  Shield
} from 'lucide-react'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'

interface ApiKeyManagerProps {
  userId: string
  subscriptionTier: number
}

interface ApiKey {
  id: string
  key_name: string
  api_key_prefix: string
  permissions: string[]
  rate_limit_per_minute: number
  daily_quota: number
  is_active: boolean
  expires_at: string
  last_used_at: string
  request_count: number
  created_at: string
}

interface ApiStats {
  total_requests: number
  today_requests: number
  week_requests: number
  avg_response_time: number
  error_count: number
}

export function ApiKeyManager({ userId, subscriptionTier }: ApiKeyManagerProps) {
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [copied, setCopied] = useState(false)

  // Check if user has access (Scale tier only)
  const hasAccess = subscriptionTier >= 100

  // Fetch API keys
  const { data, isLoading } = useQuery({
    queryKey: ['seller-api-keys', userId],
    queryFn: async () => {
      const response = await fetch('/api/seller/api-keys')
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch API keys')
      }
      return response.json()
    },
    enabled: hasAccess,
  })

  const keys: ApiKey[] = data?.keys || []
  const stats: ApiStats = data?.stats

  // Create key mutation
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch('/api/seller/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyName: name,
          permissions: ['read:products', 'read:orders', 'read:analytics'],
          rateLimit: 60,
          dailyQuota: 1000,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create API key')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      setNewKeyValue(data.fullKey)
      setShowCreateDialog(false)
      setShowNewKeyDialog(true)
      setNewKeyName('')
      queryClient.invalidateQueries({ queryKey: ['seller-api-keys', userId] })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    },
  })

  // Revoke key mutation
  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await fetch(`/api/seller/api-keys/${keyId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to revoke API key')
      }
      
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-api-keys', userId] })
      toast({
        title: tCommon('success'),
        description: 'API密钥已撤销',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    },
  })

  const handleCreate = () => {
    if (!newKeyName.trim()) return
    createMutation.mutate(newKeyName.trim())
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(newKeyValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: tCommon('success'),
      description: 'API密钥已复制到剪贴板',
    })
  }

  const handleCloseNewKeyDialog = () => {
    setShowNewKeyDialog(false)
    setNewKeyValue('')
  }

  if (!hasAccess) {
    return (
      <Card className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            API访问功能仅对 Scale 档位卖家开放。
            请升级您的订阅以使用此功能。
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_requests || 0}</div>
              <p className="text-xs text-muted-foreground">总请求数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.today_requests || 0}</div>
              <p className="text-xs text-muted-foreground">今日请求</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{Math.round(stats.avg_response_time || 0)}ms</div>
              <p className="text-xs text-muted-foreground">平均响应</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.error_count || 0}</div>
              <p className="text-xs text-muted-foreground">错误数</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* API密钥列表 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>API密钥</CardTitle>
            <CardDescription>管理您的API访问密钥</CardDescription>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            disabled={keys.length >= 5}
          >
            <Plus className="mr-2 h-4 w-4" />
            创建密钥
          </Button>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>暂无API密钥</p>
              <p className="text-sm">创建密钥以开始使用API</p>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div 
                  key={key.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{key.key_name}</span>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active ? '活跃' : '已撤销'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {key.api_key_prefix}...
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>限额: {key.rate_limit_per_minute}/分钟</span>
                      <span>日配额: {key.daily_quota}</span>
                      {key.last_used_at && (
                        <span>最后使用: {new Date(key.last_used_at).toLocaleDateString('zh-CN')}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => revokeMutation.mutate(key.id)}
                    disabled={!key.is_active || revokeMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {keys.length >= 5 && (
            <p className="text-sm text-muted-foreground mt-4">
              已达到最大密钥数量限制 (5个)
            </p>
          )}
        </CardContent>
      </Card>

      {/* 创建密钥对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建API密钥</DialogTitle>
            <DialogDescription>
              为新密钥命名以便识别
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>密钥名称</Label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="例如：生产环境、测试环境"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                取消
              </Button>
              <Button 
                onClick={handleCreate}
                disabled={!newKeyName.trim() || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                创建
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 显示新密钥对话框 */}
      <Dialog open={showNewKeyDialog} onOpenChange={handleCloseNewKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API密钥已创建</DialogTitle>
            <DialogDescription className="text-destructive">
              请立即复制并保存此密钥。出于安全原因，它只会显示一次。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <code className="text-sm break-all">{newKeyValue}</code>
            </div>
            <Button 
              className="w-full" 
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  复制密钥
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
