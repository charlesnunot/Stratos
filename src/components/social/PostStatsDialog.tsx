'use client'

import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Heart, MessageCircle, Share2, Repeat2, Star, Coins } from 'lucide-react'

interface PostStatsDialogProps {
  open: boolean
  onClose: () => void
  post: {
    like_count: number
    comment_count: number
    share_count: number
    repost_count?: number
    favorite_count?: number
    tip_amount: number
  }
}

const statRow = (label: string, value: number | string, icon: React.ReactNode) => (
  <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
    <span className="flex items-center gap-2 text-muted-foreground">
      {icon}
      {label}
    </span>
    <span className="font-medium">{value}</span>
  </div>
)

export function PostStatsDialog({ open, onClose, post }: PostStatsDialogProps) {
  const t = useTranslations('posts')
  const tTips = useTranslations('tips')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('postStats')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-0 mt-2">
          {statRow(t('like'), post.like_count ?? 0, <Heart className="h-4 w-4" />)}
          {statRow(t('comment'), post.comment_count ?? 0, <MessageCircle className="h-4 w-4" />)}
          {statRow(t('share'), post.share_count ?? 0, <Share2 className="h-4 w-4" />)}
          {statRow(t('repostCount'), post.repost_count ?? 0, <Repeat2 className="h-4 w-4" />)}
          {statRow(t('addToFavorites'), post.favorite_count ?? 0, <Star className="h-4 w-4" />)}
          {statRow(tTips('tip'), `¥${Number(post.tip_amount ?? 0).toFixed(2)}`, <Coins className="h-4 w-4" />)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
