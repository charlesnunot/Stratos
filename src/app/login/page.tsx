import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

/**
 * 无 locale 前缀的 /login 重定向到 /{defaultLocale}/login，并保留 query（如 redirect=）。
 * 避免因 [locale] 被误解析为 "login" 导致 404。
 */
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = params && Object.keys(params).length > 0 ? new URLSearchParams(params as Record<string, string>).toString() : ''
  redirect(`/${defaultLocale}/login${q ? `?${q}` : ''}`)
}
