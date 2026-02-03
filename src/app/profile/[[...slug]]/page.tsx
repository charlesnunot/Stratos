/**
 * 根级 /profile/... 重定向到 /{defaultLocale}/profile/...
 * 避免无 locale 的 URL 被 [locale] 误匹配（locale=profile）导致 layout notFound() 出现 404。
 */
import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

interface PageProps {
  params: Promise<{ slug?: string[] }>
}

export default async function ProfileRedirectPage({ params }: PageProps) {
  const { slug } = await params
  const path = slug?.length ? slug.join('/') : ''
  redirect(`/${defaultLocale}/profile${path ? `/${path}` : ''}`)
}
