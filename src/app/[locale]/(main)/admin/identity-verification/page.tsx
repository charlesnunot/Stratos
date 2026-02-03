import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { IdentityVerificationReviewClient } from './IdentityVerificationReviewClient'

export default async function AdminIdentityVerificationPage() {
  const t = await getTranslations('admin')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    redirect('/')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('identityVerification')}</h1>
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">{t('backToDashboard')}</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('rejectIdentityDescription')}
      </p>

      <IdentityVerificationReviewClient />
    </div>
  )
}
