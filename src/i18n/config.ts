/** 项目仅支持中文与英文两种国际化 */
export const locales = ['en', 'zh'] as const
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
}

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale)
}
