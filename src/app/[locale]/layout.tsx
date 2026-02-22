import React from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
import { locales, type Locale } from '@/i18n/config'
import { setRequestLocale } from 'next-intl/server'
import { LocaleScript } from '@/components/i18n/LocaleScript'

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params

  // Ensure that the incoming `locale` is valid
  if (!locales.includes(locale)) {
    notFound()
  }

  // Enable static rendering
  setRequestLocale(locale)

  // 仅以路由 params.locale 加载 messages，保证整站 locale 与 URL 一致（不依赖 getMessages 的 request 解析）
  const messages =
    locale === 'zh'
      ? (await import('@/messages/zh.json')).default
      : (await import('@/messages/en.json')).default
  const messagesSafe = messages ?? {}

  return (
    <>
      <LocaleScript locale={locale} />
      <NextIntlClientProvider messages={messagesSafe} locale={locale}>
        {children}
      </NextIntlClientProvider>
    </>
  )
}
