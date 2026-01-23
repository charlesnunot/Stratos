/**
 * 分享工具函数
 * 用于构建不同平台的分享 URL
 */

/**
 * 复制链接到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    } else {
      // 降级方案
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      return successful
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}

/**
 * 使用浏览器原生分享 API
 */
export async function shareViaNative(data: {
  title: string
  text?: string
  url: string
}): Promise<boolean> {
  if (!navigator.share) {
    return false
  }

  try {
    await navigator.share(data)
    return true
  } catch (error: any) {
    // 用户取消分享不报错
    if (error.name === 'AbortError') {
      return false
    }
    console.error('Failed to share via native API:', error)
    return false
  }
}

/**
 * 分享到微博
 */
export function shareToWeibo(url: string, title: string): void {
  const shareUrl = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
  window.open(shareUrl, '_blank', 'width=600,height=400')
}

/**
 * 分享到 QQ
 */
export function shareToQQ(url: string, title: string): void {
  const shareUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
  window.open(shareUrl, '_blank', 'width=600,height=400')
}

/**
 * 分享到 Twitter
 */
export function shareToTwitter(url: string, text: string): void {
  const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  window.open(shareUrl, '_blank', 'width=600,height=400')
}

/**
 * 分享到 Facebook
 */
export function shareToFacebook(url: string): void {
  const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  window.open(shareUrl, '_blank', 'width=600,height=400')
}

/**
 * 生成微信分享二维码 URL
 * 使用在线 API 生成二维码
 */
export function getWeChatQRCodeUrl(url: string): string {
  // 使用 qr-server.com API 生成二维码
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
}

/**
 * 检查是否支持原生分享
 */
export function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator
}
