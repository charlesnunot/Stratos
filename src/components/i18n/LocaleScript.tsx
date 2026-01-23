'use client'

import { useParams } from 'next/navigation'
import { useEffect, use } from 'react'
import { locales, type Locale, localeNames } from '@/i18n/config'

interface LocaleScriptProps {
  locale?: Locale
}

export function LocaleScript({ locale: serverLocale }: LocaleScriptProps = {}) {
  const params = useParams()
  const clientLocale = (params?.locale as Locale) || serverLocale || 'en'
  const locale = serverLocale || clientLocale

  useEffect(() => {
    if (locales.includes(locale)) {
      const localeInfo = localeNames[locale]
      const dir = localeInfo.rtl ? 'rtl' : 'ltr'
      document.documentElement.lang = locale
      document.documentElement.dir = dir
    }
  }, [locale])

  return null
}
