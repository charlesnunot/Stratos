'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function ContentReview() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [pendingPosts, setPendingPosts] = useState<any[]>([])
  const [pendingProducts, setPendingProducts] = useState<any[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [roleCheck, setRoleCheck] = useState<'idle' | 'loading' | 'allowed' | 'denied'>('idle')
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')

  useEffect(() => {
    if (!user) {
      setRoleCheck('denied')
      return
    }
    let cancelled = false
    setRoleCheck('loading')
    const client = createClient()
    client
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        const role = data?.role ?? 'user'
        if (role === 'admin' || role === 'support') {
          setRoleCheck('allowed')
        } else {
          setRoleCheck('denied')
        }
      })
      .catch(() => {
        if (!cancelled) setRoleCheck('denied')
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (roleCheck !== 'allowed') return
    loadPendingContent()
  }, [roleCheck])

  const loadPendingContent = async () => {
    // Load pending posts
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    // Load pending products
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (posts) setPendingPosts(posts)
    if (products) setPendingProducts(products)
  }

  // 状态映射：商品和帖子使用不同的状态值
  const getStatusValue = (type: 'post' | 'product', action: 'approved' | 'rejected'): string => {
    if (action === 'rejected') {
      return 'rejected'
    }
    // 商品审核通过应设置为 'active'，帖子审核通过应设置为 'approved'
    return type === 'product' ? 'active' : 'approved'
  }

  const handleReview = async (
    type: 'post' | 'product',
    id: string,
    action: 'approved' | 'rejected'
  ) => {
    if (!user) return

    const key = `${type}-${id}-${action}`
    setLoading((prev) => ({ ...prev, [key]: true }))

    try {
      const table = type === 'post' ? 'posts' : 'products'
      const statusValue = getStatusValue(type, action)
      
      const { error } = await supabase
        .from(table)
        .update({
          status: statusValue,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) {
        console.error('审核失败:', error)
        toast({
          variant: 'destructive',
          title: '错误',
          description: `审核失败：${error.message || '请稍后重试'}`,
        })
        return
      }

      // 成功提示
      const typeLabel = type === 'post' ? '帖子' : '商品'
      const actionLabel = action === 'approved' ? '通过' : '拒绝'
      toast({
        variant: 'success',
        title: '成功',
        description: `${typeLabel}已${actionLabel}`,
      })

      // 使相关查询失效以刷新数据
      if (type === 'post') {
        queryClient.invalidateQueries({ queryKey: ['posts'] })
        queryClient.invalidateQueries({ queryKey: ['post', id] })
        queryClient.invalidateQueries({ queryKey: ['posts', 'pending'] })
        queryClient.invalidateQueries({ queryKey: ['posts', 'approved'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['products'] })
        queryClient.invalidateQueries({ queryKey: ['product', id] })
        queryClient.invalidateQueries({ queryKey: ['products', 'pending'] })
        queryClient.invalidateQueries({ queryKey: ['products', 'active'] })
      }

      // 刷新列表
      await loadPendingContent()
    } catch (error: any) {
      console.error('审核操作错误:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: `审核失败：${error.message || '请稍后重试'}`,
      })
    } finally {
      setLoading((prev) => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
    }
  }

  if (roleCheck === 'loading' || roleCheck === 'idle') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (roleCheck === 'denied') {
    return (
      <Card className="p-6 text-center">
        <p className="mb-4 text-muted-foreground">您没有权限访问内容审核功能。</p>
        <Button variant="outline" onClick={() => router.push('/')}>
          返回首页
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-xl font-semibold">{t('pendingPosts')}</h2>
        <div className="space-y-4">
          {pendingPosts.map((post) => (
            <Card key={post.id} className="p-4">
              <p className="mb-2">{post.content}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleReview('post', post.id, 'approved')}
                  disabled={loading[`post-${post.id}-approved`] || loading[`post-${post.id}-rejected`]}
                >
                  {loading[`post-${post.id}-approved`] ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      处理中...
                    </>
                  ) : (
                    '通过'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleReview('post', post.id, 'rejected')}
                  disabled={loading[`post-${post.id}-approved`] || loading[`post-${post.id}-rejected`]}
                >
                  {loading[`post-${post.id}-rejected`] ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      处理中...
                    </>
                  ) : (
                    '拒绝'
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">{t('pendingProducts')}</h2>
        <div className="space-y-4">
          {pendingProducts.map((product) => (
            <Card key={product.id} className="p-4">
              <h3 className="mb-2 font-semibold">{product.name}</h3>
              <p className="mb-2 text-sm text-muted-foreground">
                {product.description}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleReview('product', product.id, 'approved')}
                  disabled={loading[`product-${product.id}-approved`] || loading[`product-${product.id}-rejected`]}
                >
                  {loading[`product-${product.id}-approved`] ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tCommon('loading')}
                    </>
                  ) : (
                    t('approve')
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleReview('product', product.id, 'rejected')}
                  disabled={loading[`product-${product.id}-approved`] || loading[`product-${product.id}-rejected`]}
                >
                  {loading[`product-${product.id}-rejected`] ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tCommon('loading')}
                    </>
                  ) : (
                    t('reject')
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
