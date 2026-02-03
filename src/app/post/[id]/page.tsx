import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

type Props = { params: Promise<{ id: string }> }

/**
 * 无 locale 前缀的 /post/[id] 重定向到 /{defaultLocale}/post/[id]，
 * 避免因 [locale] 被误解析导致 404（例如创建帖子后跳转到 /post/{id} 未带 locale 时）。
 */
export default async function PostIdRedirect({ params }: Props) {
  const { id } = await params
  redirect(`/${defaultLocale}/post/${id}`)
}
