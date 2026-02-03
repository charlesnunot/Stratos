'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { locales, localeNames, type Locale } from '@/i18n/config'
import { Button } from '@/components/ui/button'
import { Languages } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { useLocale } from 'next-intl'

export function LanguageSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentLocale = (useLocale() as Locale) || 'en'
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)

  const handleLocaleChange = (newLocale: Locale) => {
    router.replace(pathname as any, { locale: newLocale })
    setIsOpen(false)
  }

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect()
          setPosition({
            top: rect.bottom + 8, // mt-2 = 8px
            right: window.innerWidth - rect.right,
          })
        }
      }

      updatePosition()

      // 监听窗口大小变化和滚动
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)

      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    } else {
      setPosition(null)
    }
  }, [isOpen])

  const currentLocaleInfo = localeNames[currentLocale]

  return (
    <div className="relative" ref={buttonRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline">{currentLocaleInfo.flag}</span>
        <span className="hidden md:inline">{currentLocaleInfo.nativeName}</span>
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setIsOpen(false)}
          />
          {position && (
            <Card 
              className="fixed z-[100] min-w-[180px] p-2 shadow-lg"
              style={{ top: `${position.top}px`, right: `${position.right}px` }}
            >
              <div className="space-y-1">
                {locales.map((locale) => {
                  const localeInfo = localeNames[locale]
                  const isActive = currentLocale === locale
                  return (
                    <button
                      key={locale}
                      onClick={() => handleLocaleChange(locale)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <span>{localeInfo.flag}</span>
                      <span className="flex-1">{localeInfo.nativeName}</span>
                      {isActive && <span>✓</span>}
                    </button>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
