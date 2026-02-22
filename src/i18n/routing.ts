import { defineRouting } from 'next-intl/routing'
import { locales, defaultLocale } from './config'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  // 仅以 URL 路径为准，避免 cookie/accept-language 导致 /en/... 仍显示中文
  localeDetection: false,
  // 不读写 NEXT_LOCALE cookie，彻底避免与路径不一致
  localeCookie: false,
})
