'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

const STORAGE_KEY = 'stratos_welcome_dismissed'

interface WelcomeCardProps {
  onClose?: () => void
  onDontShow?: () => void
}

export function WelcomeCard({ onClose, onDontShow }: WelcomeCardProps) {
  const { user } = useAuth()
  const router = useRouter()
  const t = useTranslations('welcome')
  const [isDismissed, setIsDismissed] = useState(true)

  // 检查 localStorage 和登录状态
  useEffect(() => {
    if (user) {
      // 已登录用户不显示
      setIsDismissed(true)
      return
    }

    // 仅在客户端检查 localStorage
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem(STORAGE_KEY) === 'true'
      setIsDismissed(dismissed)
    }
  }, [user])

  const handleClose = () => {
    setIsDismissed(true)
    if (onClose) {
      onClose()
    }
  }

  const handleDontShow = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    setIsDismissed(true)
    if (onDontShow) {
      onDontShow()
    }
  }

  const handleLearnMore = () => {
    router.push('/about')
    handleClose()
  }

  const handleRegister = () => {
    router.push('/register')
    handleClose()
  }

  // 已登录或已选择"不再显示"则不渲染
  if (user || isDismissed) {
    return null
  }

  return (
    <Card className="mb-4 p-4 relative">
      {/* Close Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-6 w-6"
        onClick={handleClose}
        aria-label={t('dontShow')}
      >
        <X className="h-4 w-4" />
      </Button>

      {/* Content */}
      <div className="space-y-3 pr-6">
        {/* Title */}
        <h3 className="text-base font-semibold pr-4">{t('title')}</h3>

        {/* Guest Message */}
        <p className="text-sm text-muted-foreground">{t('guestMessage')}</p>

        {/* Benefits */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('benefitsTitle')}</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-none pl-0">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{t('benefit1')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{t('benefit2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{t('benefit3')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{t('benefit4')}</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={handleLearnMore}
            >
              {t('learnMore')}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleRegister}
            >
              {t('registerNow')}
            </Button>
          </div>

          {/* Don't Show Again Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-foreground"
            onClick={handleDontShow}
          >
            {t('dontShow')}
          </Button>
        </div>
      </div>
    </Card>
  )
}