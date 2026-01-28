'use client'

import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Share2, Copy, MessageCircle, Twitter, Facebook } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { 
  copyToClipboard, 
  shareViaNative, 
  shareToWeibo, 
  shareToQQ, 
  shareToTwitter, 
  shareToFacebook,
  getWeChatQRCodeUrl,
  supportsNativeShare
} from '@/lib/utils/share'
import { showSuccess, showWarning, showError } from '@/lib/utils/toast'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  url: string
  title: string
  description?: string
  image?: string
  itemType: 'post' | 'product' | 'user'
  itemId: string
  onShareSuccess?: () => void
}

type SharePlatform = 
  | 'wechat' 
  | 'weibo' 
  | 'qq' 
  | 'twitter' 
  | 'facebook' 
  | 'copy' 
  | 'native'

export function ShareDialog({
  open,
  onClose,
  url,
  title,
  description,
  itemType,
  itemId,
  onShareSuccess,
}: ShareDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const supabase = useMemo(() => {
    if (typeof window !== 'undefined') {
      return createClient()
    }
    return null
  }, [])
  const [showQRCode, setShowQRCode] = useState(false)
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  const nativeShareSupported = supportsNativeShare()

  // 记录分享到数据库
  const recordShare = async () => {
    if (!user || !supabase) return

    // 用户分享不需要记录到数据库（因为 profiles 表没有 share_count 字段）
    if (itemType === 'user') {
      onShareSuccess?.()
      return
    }

    try {
      const { error } = await supabase.from('shares').insert({
        user_id: user.id,
        item_type: itemType,
        item_id: itemId,
      })
      if (error) {
        const msg = String((error as any)?.message ?? '')
        if (msg.includes('Rate limit exceeded')) {
          showWarning('操作过于频繁，请稍后再试')
        } else {
          console.error('Failed to create share record:', error)
        }
      } else {
        onShareSuccess?.()
        // 使详情页查询失效，刷新数据
        if (itemType === 'post') {
          queryClient.invalidateQueries({ queryKey: ['post', itemId] })
          queryClient.invalidateQueries({ queryKey: ['posts'] })
        } else if (itemType === 'product') {
          queryClient.invalidateQueries({ queryKey: ['product', itemId] })
          queryClient.invalidateQueries({ queryKey: ['products'] })
        }
      }
    } catch (error) {
      console.error('Failed to create share record:', error)
    }
  }

  // 处理分享到各个平台
  const handleShare = async (platform: SharePlatform) => {
    let shared = false

    switch (platform) {
      case 'wechat':
        setShowQRCode(true)
        shared = true
        break

      case 'weibo':
        shareToWeibo(url, title)
        shared = true
        break

      case 'qq':
        shareToQQ(url, title)
        shared = true
        break

      case 'twitter':
        shareToTwitter(url, title)
        shared = true
        break

      case 'facebook':
        shareToFacebook(url)
        shared = true
        break

      case 'copy':
        const copied = await copyToClipboard(url)
        if (copied) {
          showSuccess('链接已复制到剪贴板')
          shared = true
        } else {
          showError('复制失败，请稍后重试')
        }
        break

      case 'native':
        const nativeShared = await shareViaNative({
          title,
          text: description,
          url,
        })
        if (nativeShared) {
          shared = true
        }
        break
    }

    // 如果分享成功，记录到数据库
    if (shared) {
      await recordShare()
      // 非微信分享直接关闭弹窗
      if (platform !== 'wechat') {
        onClose()
      }
    }
  }

  const handleClose = () => {
    setShowQRCode(false)
    onClose()
  }

  const sharePlatforms: Array<{
    id: SharePlatform
    name: string
    icon: React.ReactNode
    enabled: boolean
  }> = (
    [
      { id: 'wechat' as SharePlatform, name: '微信', icon: <MessageCircle className="h-6 w-6" />, enabled: true },
      { id: 'weibo' as SharePlatform, name: '微博', icon: <Share2 className="h-6 w-6" />, enabled: true },
      { id: 'qq' as SharePlatform, name: 'QQ', icon: <MessageCircle className="h-6 w-6" />, enabled: true },
      { id: 'twitter' as SharePlatform, name: 'Twitter', icon: <Twitter className="h-6 w-6" />, enabled: true },
      { id: 'facebook' as SharePlatform, name: 'Facebook', icon: <Facebook className="h-6 w-6" />, enabled: true },
      { id: 'copy' as SharePlatform, name: '复制链接', icon: <Copy className="h-6 w-6" />, enabled: true },
      { id: 'native' as SharePlatform, name: '更多', icon: <Share2 className="h-6 w-6" />, enabled: nativeShareSupported },
    ].filter((platform) => platform.enabled) as Array<{ id: SharePlatform; name: string; icon: React.ReactNode; enabled: boolean }>
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="pr-8">{t('shareTo') || '分享到'}</DialogTitle>
        </DialogHeader>

        {showQRCode ? (
          <div className="flex flex-col items-center space-y-4 py-4">
            <p className="text-sm text-muted-foreground">使用微信扫描二维码分享</p>
            <div className="p-4 bg-white rounded-lg">
              <img
                src={getWeChatQRCodeUrl(url)}
                alt="微信分享二维码"
                className="w-48 h-48"
              />
            </div>
            <Button variant="outline" onClick={() => setShowQRCode(false)}>
              返回
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 py-4">
            {sharePlatforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => handleShare(platform.id)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors"
              >
                <div className="text-primary">{platform.icon}</div>
                <span className="text-sm font-medium">{platform.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
