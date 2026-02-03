import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

/**
 * 无 locale 前缀的 /post/create 重定向到 /{defaultLocale}/post/create，
 * 避免因 [locale] 被误解析为 "post" 导致 404。
 */
export default function PostCreateRedirect() {
  redirect(`/${defaultLocale}/post/create`)
}
