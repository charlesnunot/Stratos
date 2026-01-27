'use client'

import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Share2, MoreHorizontal, Flag, ExternalLink, Link2, X, Repeat2 } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { useMemo, useState, useRef, useEffect } from 'react'
import { ProductLikeButton } from './ProductLikeButton'
import { ProductWantButton } from './ProductWantButton'
import { ProductFavoriteButton } from './ProductFavoriteButton'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRepost } from '@/lib/hooks/useRepost'
import { showSuccess, showError, showInfo, showWarning } from '@/lib/utils/toast'
import { createClient } from '@/lib/supabase/client'
import { buildProductUrlWithAffiliate, getAffiliatePostId } from '@/lib/utils/affiliate-attribution'

interface ProductCardProps {
  product: {
    id: string
    name: string
    description: string | null
    price: number
    images: string[]
    seller_id: string
    stock?: number | null
    status?: string
    like_count?: number
    want_count?: number
    share_count?: number
    repost_count?: number
    favorite_count?: number
    seller?: {
      username: string
      display_name: string
      avatar_url: string | null
    }
  }
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem)
  const items = useCartStore((state) => state.items)
  const [adding, setAdding] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const { user } = useAuth()
  const router = useRouter()
  const t = useTranslations('products')
  const tCommon = useTranslations('common')
  const tPosts = useTranslations('posts')
  const supabase = useMemo(() => createClient(), [])

  // 检查商品是否已在购物车中
  const isInCart = items.some((item) => item.product_id === product.id)
  
  // 转发相关
  const repostMutation = useRepost()
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  
  // 分享相关
  const [showShareDialog, setShowShareDialog] = useState(false)

  // 计算菜单位置
  useEffect(() => {
    if (isMenuOpen && menuRef.current) {
      const updatePosition = () => {
        if (menuRef.current) {
          const rect = menuRef.current.getBoundingClientRect()
          const viewportHeight = window.innerHeight
          const viewportWidth = window.innerWidth
          
          // 估算菜单高度（约280px）
          const estimatedMenuHeight = 280
          const menuWidth = 180
          
          let top = rect.bottom + 8
          let left = rect.right - menuWidth
          
          // 检查是否会溢出底部
          if (top + estimatedMenuHeight > viewportHeight) {
            top = rect.top - estimatedMenuHeight
            // 如果上方也不够，则显示在按钮上方但限制高度
            if (top < 8) {
              top = Math.max(8, viewportHeight - estimatedMenuHeight - 8)
            }
          }
          
          // 检查左侧是否会溢出
          if (left < 8) {
            left = 8
          }
          
          setMenuPosition({ top, left })
        }
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)

      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    } else {
      setMenuPosition(null)
    }
  }, [isMenuOpen])

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 如果商品已在购物车中，不执行操作
    if (isInCart) return

    // 检查商品状态
    if (product.status && product.status !== 'active') {
      showError(`商品已下架，无法加入购物车`)
      return
    }

    // 检查库存
    if (product.stock !== null && product.stock !== undefined && product.stock <= 0) {
      showError('商品库存不足，无法加入购物车')
      return
    }

    // 实时验证商品信息（包括价格）
    setAdding(true)
    try {
      const { data: currentProduct, error } = await supabase
        .from('products')
        .select('id, status, stock, price')
        .eq('id', product.id)
        .single()

      if (error || !currentProduct) {
        showError('商品不存在或已被删除')
        setAdding(false)
        return
      }

      if (currentProduct.status !== 'active') {
        showError('商品已下架，无法加入购物车')
        setAdding(false)
        return
      }

      if (currentProduct.stock !== null && currentProduct.stock !== undefined && currentProduct.stock <= 0) {
        showError('商品库存不足，无法加入购物车')
        setAdding(false)
        return
      }

      // 验证价格是否变化（允许0.01的误差）
      const priceDiff = Math.abs(currentProduct.price - product.price)
      if (priceDiff > 0.01) {
        showWarning(`商品价格已更新为 ¥${currentProduct.price.toFixed(2)}，请刷新页面后重试`)
        setAdding(false)
        return
      }

      addItem({
        product_id: product.id,
        quantity: 1,
        price: currentProduct.price, // 使用最新价格
        name: product.name,
        image: product.images[0] || '',
      })
      // 短暂显示"已添加"反馈，然后状态会通过 isInCart 自动更新
      setTimeout(() => setAdding(false), 1500)
    } catch (error) {
      console.error('Error validating product before adding to cart:', error)
      showError('验证商品信息失败，请重试')
      setAdding(false)
    }
  }

  // 处理举报
  const handleReport = () => {
    setIsMenuOpen(false)
    if (!user) {
      showInfo('请先登录后再举报')
      return
    }
    setShowReportDialog(true)
  }

  // 处理打开商品
  const handleOpenProduct = () => {
    setIsMenuOpen(false)
    router.push(productUrl)
  }

  // 处理分享到
  const handleShareTo = () => {
    setIsMenuOpen(false)
    setShowShareDialog(true)
  }

  // 处理复制链接
  const handleCopyLink = async () => {
    setIsMenuOpen(false)
    try {
      const url = `${window.location.origin}${productUrl}`
      await navigator.clipboard.writeText(url)
      showSuccess('链接已复制到剪贴板')

      // 复制链接也算一次分享
      if (user) {
        try {
          const { error } = await supabase.from('shares').insert({
            user_id: user.id,
            item_type: 'product',
            item_id: product.id,
          })
          if (error) throw error
        } catch (error) {
          const msg = String((error as any)?.message ?? '')
          if (msg.includes('Rate limit exceeded')) {
            showWarning('操作过于频繁，请稍后再试')
          } else {
            console.error('Failed to create share record:', error)
          }
        }
      }
    } catch (error) {
      showError('复制链接失败')
    }
  }

  // 处理转发
  const handleRepost = () => {
    setIsMenuOpen(false)
    if (!user) {
      showInfo('请先登录后再转发')
      return
    }
    setShowRepostDialog(true)
  }

  const handleRepostConfirm = (targetUserIds: string[], content?: string) => {
    repostMutation.mutate(
      {
        itemType: 'product',
        itemId: product.id,
        targetUserIds: targetUserIds,
        content: content,
      },
      {
        onSuccess: (result) => {
          setShowRepostDialog(false)
          if (result.count > 0 && result.alreadyExists > 0) {
            showSuccess(`已转发给 ${result.count} 个用户（${result.alreadyExists} 个用户已接收过）`)
          } else if (result.count > 0) {
            showSuccess(`已转发给 ${result.count} 个用户`)
          } else if (result.alreadyExists > 0) {
            showInfo(`这些用户已经接收过此转发`)
          } else {
            showError('转发失败，请重试')
          }
        },
        onError: (error: any) => {
          console.error('Repost error:', error)
          showError('转发失败，请重试')
        },
      }
    )
  }

  // Get affiliate_post_id for attribution
  const affiliatePostId = useMemo(() => getAffiliatePostId(), [])
  
  // Build product URL with affiliate attribution
  const productUrl = useMemo(() => buildProductUrlWithAffiliate(product.id, affiliatePostId), [product.id, affiliatePostId])

  const handleCardClick = () => {
    router.push(productUrl)
  }

  return (
    <>
      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={handleRepostConfirm}
        isLoading={repostMutation.isPending}
      />
      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={`${typeof window !== 'undefined' ? window.location.origin : ''}${productUrl}`}
        title={product.name || '查看这个商品'}
        description={product.description || undefined}
        image={product.images?.[0]}
        itemType="product"
        itemId={product.id}
      />
      <Card 
        className="group overflow-hidden transition-shadow hover:shadow-lg w-full min-w-0 cursor-pointer"
        onClick={handleCardClick}
      >
      <Link href={productUrl}>
        <div className="relative aspect-square w-full overflow-hidden">
          {product.images && product.images.length > 0 ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <span className="text-muted-foreground">{tCommon('noImage')}</span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-3 md:p-4 min-w-0">
        <Link href={productUrl}>
          <h3 className="mb-2 font-semibold line-clamp-2 break-words">{product.name}</h3>
        </Link>
        {product.description && (
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground break-words">
            {product.description}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 mb-3">
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
            <div onClick={(e) => e.stopPropagation()}>
              <ProductLikeButton productId={product.id} initialLikes={product.like_count || 0} />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ProductWantButton productId={product.id} initialWants={product.want_count || 0} />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ProductFavoriteButton productId={product.id} initialFavorites={product.favorite_count ?? 0} />
            </div>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 sm:gap-2 shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRepost()
                }}
                disabled={repostMutation.isPending}
              >
                <Repeat2 className="h-4 w-4 shrink-0" />
                <span className="text-xs sm:text-sm">{product.repost_count || 0}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 sm:gap-2 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                handleShareTo()
              }}
            >
              <Share2 className="h-4 w-4 shrink-0" />
              <span className="text-xs sm:text-sm">{product.share_count || 0}</span>
            </Button>
          </div>
          <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                setIsMenuOpen(!isMenuOpen)
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[90]"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMenuOpen(false)
                  }}
                />
                {menuPosition && (
                  <Card 
                    className="fixed z-[100] min-w-[180px] p-2 shadow-lg"
                    style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-1">
                      {/* 举报 */}
                      <button
                        onClick={handleReport}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <Flag className="mr-2 h-4 w-4" />
                        <span>{t('report')}</span>
                      </button>

                      {/* 打开商品 */}
                      <button
                        onClick={handleOpenProduct}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        <span>{t('openProduct')}</span>
                      </button>

                      {/* 复制链接 */}
                      <button
                        onClick={handleCopyLink}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        <span>{t('copyLink')}</span>
                      </button>

                      {/* 取消 */}
                      <button
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent border-t mt-1 pt-2"
                      >
                        <X className="mr-2 h-4 w-4" />
                        <span>{tCommon('cancel')}</span>
                      </button>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">¥{product.price.toFixed(2)}</p>
          </div>
          <Button 
            size="sm" 
            onClick={handleAddToCart} 
            disabled={
              adding || 
              isInCart || 
              (product.status && product.status !== 'active') ||
              (product.stock !== null && product.stock !== undefined && product.stock <= 0)
            }
            variant={isInCart ? 'secondary' : 'default'}
            className="flex-shrink-0"
          >
            <ShoppingCart className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">
              {adding ? t('addedToCart') : isInCart ? t('alreadyInCart') : t('addToCart')}
            </span>
            <span className="sm:hidden">
              {adding ? t('addedToCart') : isInCart ? t('inCart') : t('addToCart')}
            </span>
          </Button>
        </div>

        {/* User Info */}
        {product.seller && (
          <Link
            href={`/profile/${product.seller_id}`}
            className="mt-3 flex items-center justify-between gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {product.seller.avatar_url ? (
                  <img
                    src={product.seller.avatar_url}
                    alt={product.seller.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs">{product.seller.display_name?.[0] || product.seller.username?.[0]}</span>
                )}
              </div>
              <p className="text-sm font-semibold truncate">{product.seller.display_name || product.seller.username}</p>
            </div>
          </Link>
        )}
      </div>

      {/* 举报对话框 */}
      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="product"
        reportedId={product.id}
      />
    </Card>
    </>
  )
}
