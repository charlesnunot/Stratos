'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  Compass,
  Edit3,
  UserCircle,
  ShoppingBag,
  MessageCircle,
  Package,
  HelpCircle,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react'

const STORAGE_KEY = 'stratos_onboarding_completed'
const NEW_USER_TIME_LIMIT = 48 * 60 * 60 * 1000 // 48小时（毫秒）

interface OnboardingStep {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

export function OnboardingGuide() {
  const { user } = useAuth()
  const t = useTranslations('onboarding')
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  // 获取用户档案以检查创建时间
  const { data: profileResult } = useProfile(user?.id || '')
  const profile = profileResult ?? null

  // 判断是否显示引导
  useEffect(() => {
    if (!user || !profile) return

    // 检查是否已完成引导
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(STORAGE_KEY) === 'true'
      if (completed) return
    }

    // 检查用户注册时间是否在48小时内
    const createdAt = new Date(profile.created_at).getTime()
    const now = Date.now()
    const timeDiff = now - createdAt

    if (timeDiff <= NEW_USER_TIME_LIMIT && timeDiff >= 0) {
      setIsOpen(true)
    }
  }, [user, profile])

  const steps: OnboardingStep[] = useMemo(() => {
    const baseSteps: OnboardingStep[] = [
      {
        icon: Sparkles,
        title: t('steps.welcome.title'),
        description: t('steps.welcome.description'),
      },
      {
        icon: Compass,
        title: t('steps.discover.title'),
        description: t('steps.discover.description'),
      },
      {
        icon: Edit3,
        title: t('steps.create.title'),
        description: t('steps.create.description'),
      },
      {
        icon: UserCircle,
        title: t('steps.profile.title'),
        description: t('steps.profile.description'),
      },
      {
        icon: ShoppingBag,
        title: t('steps.explore.title'),
        description: t('steps.explore.description'),
      },
      {
        icon: MessageCircle,
        title: t('steps.message.title'),
        description: t('steps.message.description'),
      },
      {
        icon: Package,
        title: t('steps.orders.title'),
        description: t('steps.orders.description'),
      },
      {
        icon: HelpCircle,
        title: t('steps.help.title'),
        description: t('steps.help.description'),
      },
    ]

    // 根据角色添加特定步骤（直营卖家或有效卖家订阅）
    const isSeller = profile?.seller_subscription_active === true || (profile as { seller_type?: string })?.seller_type === 'direct'
    if (isSeller) {
      return [
        ...baseSteps,
        {
          icon: ShoppingBag,
          title: t('steps.seller.title'),
          description: t('steps.seller.description'),
        },
      ]
    }

    if (profile?.affiliate_subscription_active === true) {
      return [
        ...baseSteps,
        {
          icon: TrendingUp,
          title: t('steps.affiliate.title'),
          description: t('steps.affiliate.description'),
        },
      ]
    }

    return baseSteps
  }, [profile?.seller_subscription_active, profile?.affiliate_subscription_active, profile?.seller_type, t])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    setIsOpen(false)
  }

  if (!isOpen || !user || !profile) return null

  const currentStepData = steps[currentStep]
  const IconComponent = currentStepData.icon
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">
            {currentStepData.title}
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            {currentStepData.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            {isLastStep ? (
              <CheckCircle2 className="h-10 w-10 text-primary" />
            ) : (
              <IconComponent className="h-10 w-10 text-primary" />
            )}
          </div>

          {/* 进度指示器 */}
          <div className="flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-primary'
                    : index < currentStep
                    ? 'bg-primary/50'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('progress', { current: currentStep + 1, total: steps.length })}
          </p>
        </div>

        <div className="flex gap-2">
          {!isFirstStep && (
            <Button
              variant="outline"
              onClick={handlePrevious}
              className="flex-1"
            >
              {t('previous')}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleSkip}
            className={isFirstStep ? 'flex-1' : ''}
          >
            {t('skip')}
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {isLastStep ? t('complete') : t('next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
