import { redirect } from '@/i18n/navigation'

/**
 * Redirect /admin/content-review -> /admin/review
 * Keeps task/docs path naming consistent; actual content review UI lives at /admin/review.
 */
export default async function AdminContentReviewRedirect({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect({ href: '/admin/review', locale })
}
