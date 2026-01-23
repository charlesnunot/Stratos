export const locales = ['en', 'zh', 'es', 'pt', 'ja', 'ar'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, { name: string; nativeName: string; flag: string; rtl?: boolean }> = {
  en: {
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
  },
  zh: {
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
  },
  es: {
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
  },
  pt: {
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇵🇹',
  },
  ja: {
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
  },
  ar: {
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    rtl: true,
  },
}

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale)
}
