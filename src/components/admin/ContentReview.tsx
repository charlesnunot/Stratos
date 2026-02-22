'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function ContentReview() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [pendingPosts, setPendingPosts] = useState<any[]>([])
  const [pendingProducts, setPendingProducts] = useState<any[]>([])
  const [pendingComments, setPendingComments] = useState<any[]>([])
  const [pendingProductComments, setPendingProductComments] = useState<any[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [roleCheck, setRoleCheck] = useState<'idle' | 'loading' | 'allowed' | 'denied'>('idle')
  /** 待审帖子按 post_type 筛选，空为全部 */
  const [postTypeFilter, setPostTypeFilter] = useState<string>('')
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')

  /** 待审帖子按类型显示标签：normal/image/text/story/music/short_video/series/affiliate → admin.postTypeXxx */
  const getPostTypeLabel = (postType: string | null | undefined): string => {
    if (!postType || !/^(normal|image|text|story|music|short_video|series|affiliate)$/.test(postType)) {
      return t('postTypeNormal')
    }
    const camel = postType.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
    return t(('postType' + camel) as 'postTypeNormal' | 'postTypeImage' | 'postTypeText' | 'postTypeStory' | 'postTypeMusic' | 'postTypeShortVideo' | 'postTypeSeries' | 'postTypeAffiliate')
  }

  useEffect(() => {
    if (!user) {
      setRoleCheck('denied')
      return
    }
    let cancelled = false
    setRoleCheck('loading')
    const client = createClient()
    void (async () => {
      try {
        const { data } = await client
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (cancelled) return
        const role = data?.role ?? 'user'
        if (role === 'admin' || role === 'support') {
          setRoleCheck('allowed')
        } else {
          setRoleCheck('denied')
        }
      } catch {
        if (!cancelled) setRoleCheck('denied')
      }
    })()
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

    // Load pending comments（admin/support 可查；需 RLS 允许 SELECT）
    const { data: comments } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    // Load pending product comments (商品讨论)
    const { data: productComments } = await supabase
      .from('product_comments')
      .select('id, product_id, user_id, content, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (posts) setPendingPosts(posts)
    if (products) setPendingProducts(products)
    if (comments) setPendingComments(comments)
    if (productComments) setPendingProductComments(productComments)
  }

  // 状态映射：商品/帖子/评论/商品讨论使用不同状态值
  const getStatusValue = (type: 'post' | 'product' | 'comment' | 'product_comment', action: 'approved' | 'rejected'): string => {
    if (action === 'rejected') {
      return 'rejected'
    }
    if (type === 'product') return 'active'
    if (type === 'comment' || type === 'product_comment') return 'approved'
    return 'approved' // post
  }

  const handleReview = async (
    type: 'post' | 'product' | 'comment' | 'product_comment',
    id: string,
    action: 'approved' | 'rejected'
  ) => {
    if (!user) return

    const key = `${type}-${id}-${action}`
    setLoading((prev) => ({ ...prev, [key]: true }))

    try {
      // 帖子点击「通过」：必须先迁移图片，迁移成功才允许审核通过
      if (type === 'post' && action === 'approved') {
        const migrateRes = await fetch('/api/cloudinary/migrate-post-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: id }),
        })
        const migrateBody = await migrateRes.json().catch(() => ({}))
        if (!migrateRes.ok || migrateBody?.ok === false) {
          toast({
            variant: 'destructive',
            title: t('reviewFailed'),
            description: migrateBody?.error ?? t('migrateImagesFailed'),
          })
          return
        }
      }

      // 评论点击「通过」：必须先迁移评论图片，迁移成功才允许审核通过
      if (type === 'comment' && action === 'approved') {
        const migrateRes = await fetch('/api/cloudinary/migrate-comment-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentId: id }),
        })
        const migrateBody = await migrateRes.json().catch(() => ({}))
        if (!migrateRes.ok || migrateBody?.ok === false) {
          toast({
            variant: 'destructive',
            title: t('reviewFailed'),
            description: migrateBody?.error ?? t('migrateCommentImagesFailed'),
          })
          return
        }
      }

      // 商品讨论点击「通过」：必须先迁移讨论图片，迁移成功才允许审核通过
      if (type === 'product_comment' && action === 'approved') {
        const migrateRes = await fetch('/api/cloudinary/migrate-product-comment-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productCommentId: id }),
        })
        const migrateBody = await migrateRes.json().catch(() => ({}))
        if (!migrateRes.ok || migrateBody?.ok === false) {
          toast({
            variant: 'destructive',
            title: t('reviewFailed'),
            description: migrateBody?.error ?? t('migrateProductCommentImagesFailed'),
          })
          return
        }
      }

      const endpoint =
        action === 'approved'
          ? `/api/admin/content-review/${id}/approve`
          : `/api/admin/content-review/${id}/reject`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const resBody = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: tCommon('error'),
          description: resBody.error || t('reviewFailed'),
        })
        return
      }

      const typeLabel =
        type === 'post' ? t('post') :
        type === 'product' ? t('product') :
        type === 'product_comment' ? t('productComment') :
        t('comment')
      const resultLabel = action === 'approved' ? t('approved') : t('rejected')
      toast({
        variant: 'success',
        title: tCommon('success'),
        description: t('contentReviewed', { type: typeLabel, result: resultLabel }),
      })

      // 使相关查询失效以刷新数据
      if (type === 'post') {
        queryClient.invalidateQueries({ queryKey: ['posts'] })
        queryClient.invalidateQueries({ queryKey: ['post', id] })
        queryClient.invalidateQueries({ queryKey: ['posts', 'pending'] })
        queryClient.invalidateQueries({ queryKey: ['posts', 'approved'] })
      } else if (type === 'product') {
        queryClient.invalidateQueries({ queryKey: ['products'] })
        queryClient.invalidateQueries({ queryKey: ['product', id] })
        queryClient.invalidateQueries({ queryKey: ['products', 'pending'] })
        queryClient.invalidateQueries({ queryKey: ['products', 'active'] })
      } else if (type === 'product_comment') {
        queryClient.invalidateQueries({ queryKey: ['productComments'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['comments'] })
      }

      // 刷新列表
      await loadPendingContent()
    } catch (error: any) {
      console.error('Review error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('reviewFailed') + ': ' + (error.message || tCommon('operationFailed')),
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
        <p className="mb-4 text-muted-foreground">{t('noContentReviewPermission')}</p>
        <Button variant="outline" onClick={() => router.push('/')}>
          {t('backToHome')}
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{t('pendingPosts')}</h2>
          <select
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={postTypeFilter}
            onChange={(e) => setPostTypeFilter(e.target.value)}
            aria-label={t('filterByType')}
          >
            <option value="">{t('filterAll')}</option>
            <option value="image">{t('postTypeImage')}</option>
            <option value="story">{t('postTypeStory')}</option>
            <option value="music">{t('postTypeMusic')}</option>
            <option value="short_video">{t('postTypeShortVideo')}</option>
          </select>
        </div>
        <div className="space-y-4">
          {pendingPosts
            .filter((post) => {
              if (!postTypeFilter) return true
              if (postTypeFilter === 'image') return ['normal', 'image', 'text'].includes(post.post_type ?? '')
              return (post.post_type ?? '') === postTypeFilter
            })
            .map((post) => (
              <Card key={post.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{getPostTypeLabel(post.post_type)}</Badge>
                </div>
                {/* 按类型展示内容预览 */}
                {(post.post_type === 'story' || post.post_type === 'series') && (
                  <div className="mb-2">
                    {post.chapter_number != null && (
                      <span className="text-muted-foreground text-sm">{t('chapterNumber')}: {post.chapter_number} </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{post.content ? (post.content.length > 300 ? post.content.slice(0, 300) + '…' : post.content) : '—'}</p>
                    {Array.isArray(post.image_urls) && post.image_urls[0] && (
                      <img src={post.image_urls[0]} alt="" className="mt-2 max-h-32 rounded object-cover" />
                    )}
                  </div>
                )}
                {(post.post_type === 'music') && (
                  <div className="mb-2">
                    <p className="whitespace-pre-wrap break-words">{post.content || '—'}</p>
                    {post.cover_url && <img src={post.cover_url} alt="" className="mt-2 max-h-24 rounded object-cover" />}
                    {post.duration_seconds != null && <span className="text-muted-foreground text-sm"> · {t('durationSeconds')}: {post.duration_seconds}</span>}
                    {post.music_url && (
                      <div className="mt-2">
                        <audio src={post.music_url} controls className="max-w-full" preload="metadata" />
                        <a href={post.music_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline">{post.music_url.slice(0, 60)}…</a>
                      </div>
                    )}
                  </div>
                )}
                {(post.post_type === 'short_video') && (
                  <div className="mb-2">
                    <p className="whitespace-pre-wrap break-words">{post.content || '—'}</p>
                    {post.cover_url && <img src={post.cover_url} alt="" className="mt-2 max-h-24 rounded object-cover" />}
                    {post.duration_seconds != null && <span className="text-muted-foreground text-sm"> · {t('durationSeconds')}: {post.duration_seconds}</span>}
                    {post.video_url && (
                      <div className="mt-2">
                        <video src={post.video_url} controls className="max-h-48 max-w-full rounded" preload="metadata" />
                        <a href={post.video_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline">{post.video_url.slice(0, 60)}…</a>
                      </div>
                    )}
                  </div>
                )}
                {(!post.post_type || ['normal', 'image', 'text', 'affiliate'].includes(post.post_type)) && (
                  <div className="mb-2">
                    <p className="whitespace-pre-wrap break-words">{post.content || '—'}</p>
                    {Array.isArray(post.image_urls) && post.image_urls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {post.image_urls.slice(0, 4).map((url: string, i: number) => (
                          <img key={i} src={url} alt="" className="max-h-24 rounded object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleReview('post', post.id, 'approved')}
                    disabled={loading[`post-${post.id}-approved`] || loading[`post-${post.id}-rejected`]}
                  >
                    {loading[`post-${post.id}-approved`] ? (
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
                    onClick={() => handleReview('post', post.id, 'rejected')}
                    disabled={loading[`post-${post.id}-approved`] || loading[`post-${post.id}-rejected`]}
                  >
                    {loading[`post-${post.id}-rejected`] ? (
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

      <div>
        <h2 className="mb-4 text-xl font-semibold">{t('pendingComments')}</h2>
        <div className="space-y-4">
          {pendingComments.map((comment: any) => (
            <Card key={comment.id} className="p-4">
              <p className="mb-2 text-sm text-muted-foreground">
                {t('postId')}: {comment.post_id} · {t('commentId')}: {comment.id}
              </p>
              <p className="mb-2">{comment.content}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleReview('comment', comment.id, 'approved')}
                  disabled={loading[`comment-${comment.id}-approved`] || loading[`comment-${comment.id}-rejected`]}
                >
                  {loading[`comment-${comment.id}-approved`] ? (
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
                  onClick={() => handleReview('comment', comment.id, 'rejected')}
                  disabled={loading[`comment-${comment.id}-approved`] || loading[`comment-${comment.id}-rejected`]}
                >
                  {loading[`comment-${comment.id}-rejected`] ? (
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

      <div>
        <h2 className="mb-4 text-xl font-semibold">{t('pendingProductComments')}</h2>
        <div className="space-y-4">
          {pendingProductComments.map((pc: any) => (
            <Card key={pc.id} className="p-4">
              <p className="mb-2 text-sm text-muted-foreground">
                {t('productId')}: {pc.product_id} · {t('productCommentId')}: {pc.id}
              </p>
              <p className="mb-2">{pc.content}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleReview('product_comment', pc.id, 'approved')}
                  disabled={loading[`product_comment-${pc.id}-approved`] || loading[`product_comment-${pc.id}-rejected`]}
                >
                  {loading[`product_comment-${pc.id}-approved`] ? (
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
                  onClick={() => handleReview('product_comment', pc.id, 'rejected')}
                  disabled={loading[`product_comment-${pc.id}-approved`] || loading[`product_comment-${pc.id}-rejected`]}
                >
                  {loading[`product_comment-${pc.id}-rejected`] ? (
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

      <div>
        <h2 className="mb-4 text-xl font-semibold">{t('pendingProducts')}</h2>
        <div className="space-y-4">
          {pendingProducts.map((product) => (
            <Card key={product.id} className="p-4">
              <h3 className="mb-2 font-semibold">{product.name}</h3>
              <p className="mb-2 text-sm text-muted-foreground">
                {product.description}
              </p>
              
              {/* 商品详细信息 */}
              <div className="mb-3 space-y-1 text-sm">
                {/* 价格 + 货币 */}
                {product.price != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('productPriceLabel')}</span>
                    <span>{product.currency || 'USD'} {Number(product.price).toFixed(2)}</span>
                  </div>
                )}
                
                {/* 库存 */}
                {product.stock != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('productStockLabel')}</span>
                    <span>{product.stock}</span>
                  </div>
                )}
                
                {/* 运费 */}
                {product.shipping_fee != null && Number(product.shipping_fee) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('shippingFeeLabel')}</span>
                    <span>{product.currency || 'USD'} {Number(product.shipping_fee).toFixed(2)}</span>
                  </div>
                )}
                
                {/* 成色 */}
                {product.condition && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('conditionLabel')}</span>
                    <span>{product.condition}</span>
                  </div>
                )}
                
                {/* 销售国家 */}
                {Array.isArray(product.sales_countries) && product.sales_countries.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground">{t('salesCountriesLabel')}</span>
                    <span>{product.sales_countries.join(', ')}</span>
                  </div>
                )}
                
                {/* 可见性 */}
                {product.visibility && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('visibilityLabel')}</span>
                    <span>{product.visibility}</span>
                  </div>
                )}
              </div>
              
              {/* 图片缩略图 */}
              {Array.isArray(product.images) && product.images.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {product.images.slice(0, 3).map((url: string, i: number) => (
                    <img key={i} src={url} alt={`Product image ${i+1}`} className="h-20 w-20 object-cover rounded" />
                  ))}
                </div>
              )}
              
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
