import React from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
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

  const messages = (await getMessages({ locale })) ?? {}

  return (
    <>
      <LocaleScript locale={locale} />
      <NextIntlClientProvider messages={messages} locale={locale}>
        {children}
      </NextIntlClientProvider>
    </>
  )
}
