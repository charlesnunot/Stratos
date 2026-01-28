'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@/i18n/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Star, 
  Trash2, 
  FileText, 
  Package, 
  User, 
  MessageSquare,
  ShoppingBag,
  Gift,
  MessageCircle,
  Edit2,
  CheckSquare,
  Square
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useToggleFavorite, type Favorite } from '@/lib/hooks/useFavorites'
import { useAuth } from '@/lib/hooks/useAuth'
import { showSuccess, showError } from '@/lib/utils/toast'
import { FavoriteNotesDialog } from './FavoriteNotesDialog'
import Image from 'next/image'

interface FavoriteItemProps {
  favorite: Favorite
  selected?: boolean
  onSelect?: () => void
}

export function FavoriteItem({ favorite, selected = false, onSelect }: FavoriteItemProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('favorites')
  const tCommon = useTranslations('common')
  const [showNotesDialog, setShowNotesDialog] = useState(false)
  const toggleFavorite = useToggleFavorite()

  // Fetch the actual content based on item_type
  const { data: content, isLoading } = useQuery({
    queryKey: ['favoriteContent', favorite.item_type, favorite.item_id],
    queryFn: async () => {
      if (favorite.item_type === 'post') {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            id,
            content,
            image_urls,
            created_at,
            user:profiles!posts_user_id_fkey(id, username, display_name, avatar_url)
          `)
          .eq('id', favorite.item_id)
          .single()
        if (error) throw error
        return { type: 'post', data }
      } else if (favorite.item_type === 'product') {
        const { data, error } = await supabase
          .from('products')
          .select(`
            id,
            name,
            description,
            price,
            images,
            created_at,
            seller:profiles!products_seller_id_fkey(id, username, display_name, avatar_url)
          `)
          .eq('id', favorite.item_id)
          .single()
        if (error) throw error
        return { type: 'product', data }
      } else if (favorite.item_type === 'user') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, created_at')
          .eq('id', favorite.item_id)
          .single()
        if (error) throw error
        return { type: 'user', data }
      }
      return null
    },
    enabled: !!favorite.item_id,
  })

  const handleRemove = async () => {
    if (!user) return

    try {
      await toggleFavorite.mutateAsync({
        itemType: favorite.item_type,
        itemId: favorite.item_id,
        isFavorite: true, // true means remove
      })
      showSuccess(t('removed'))
    } catch (error) {
      showError(tCommon('error'))
    }
  }

  const getItemLink = () => {
    if (favorite.item_type === 'post') return `/post/${favorite.item_id}`
    if (favorite.item_type === 'product') return `/product/${favorite.item_id}`
    if (favorite.item_type === 'user') return `/profile/${favorite.item_id}`
    return '#'
  }

  const getItemIcon = () => {
    switch (favorite.item_type) {
      case 'post':
        return <FileText className="h-4 w-4" />
      case 'product':
        return <Package className="h-4 w-4" />
      case 'user':
        return <User className="h-4 w-4" />
      case 'comment':
        return <MessageSquare className="h-4 w-4" />
      case 'order':
        return <ShoppingBag className="h-4 w-4" />
      case 'tip':
        return <Gift className="h-4 w-4" />
      case 'message':
        return <MessageCircle className="h-4 w-4" />
      default:
        return <Star className="h-4 w-4" />
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN')
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </Card>
    )
  }

  if (!content) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getItemIcon()}
            <span className="text-sm text-muted-foreground">
              {favorite.item_type} (已删除)
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={toggleFavorite.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card className={`p-4 ${selected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex gap-4">
          {/* Selection Checkbox */}
          {onSelect && (
            <button
              onClick={onSelect}
              className="mt-1 flex-shrink-0"
              type="button"
            >
              {selected ? (
                <CheckSquare className="h-5 w-5 text-primary" />
              ) : (
                <Square className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          )}
          {/* Content Preview */}
          <Link href={getItemLink()} className="flex-1">
            {content.type === 'post' && (() => {
              const postData = content.data as { content?: string; image_urls?: string[]; user?: { display_name?: string; username?: string } }
              return (
                <div className="flex gap-4">
                  {postData.image_urls?.[0] && (
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded">
                      <Image
                        src={postData.image_urls[0]}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      {getItemIcon()}
                      <Badge variant="secondary">{t('filterPosts')}</Badge>
                    </div>
                    <p className="line-clamp-2 text-sm">
                      {postData.content || '无内容'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {postData.user?.display_name || postData.user?.username}
                    </p>
                  </div>
                </div>
              )
            })()}

            {content.type === 'product' && (() => {
              const productData = content.data as {
                images?: string[]
                name?: string
                price?: number
                seller?: { display_name?: string; username?: string }
              }
              return (
                <div className="flex gap-4">
                  {productData.images?.[0] && (
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded">
                      <Image
                        src={productData.images[0]}
                        alt={productData.name ?? ''}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      {getItemIcon()}
                      <Badge variant="secondary">{t('filterProducts')}</Badge>
                    </div>
                    <p className="font-medium">{productData.name}</p>
                    <p className="text-sm text-muted-foreground">
                      ¥{productData.price?.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {productData.seller?.display_name || productData.seller?.username}
                    </p>
                  </div>
                </div>
              )
            })()}

            {content.type === 'user' && (() => {
              const userData = content.data as {
                avatar_url?: string
                display_name?: string
                username?: string
                bio?: string
              }
              return (
                <div className="flex gap-4">
                  {userData.avatar_url && (
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full">
                      <Image
                        src={userData.avatar_url}
                        alt={(userData.display_name || userData.username) ?? ''}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      {getItemIcon()}
                      <Badge variant="secondary">{t('filterUsers')}</Badge>
                    </div>
                    <p className="font-medium">
                      {userData.display_name || userData.username}
                    </p>
                    {userData.bio && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {userData.bio}
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}
          </Link>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {favorite.notes && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotesDialog(true)}
                  title={favorite.notes}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
              {!favorite.notes && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotesDialog(true)}
                  title="添加备注"
                >
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={toggleFavorite.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(favorite.created_at)}
            </p>
          </div>
        </div>

        {/* Notes Preview */}
        {favorite.notes && (
          <div className="mt-3 rounded bg-muted p-2">
            <p className="text-sm">{favorite.notes}</p>
          </div>
        )}
      </Card>

      <FavoriteNotesDialog
        favorite={favorite}
        open={showNotesDialog}
        onOpenChange={setShowNotesDialog}
      />
    </>
  )
}
