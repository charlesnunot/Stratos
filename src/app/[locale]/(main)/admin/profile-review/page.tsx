import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { ProfileReviewClient } from './ProfileReviewClient'

export default async function AdminProfileReviewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    redirect('/')
  }

  const { data: pendingProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, bio, location, pending_display_name, pending_username, pending_avatar_url, pending_bio, pending_location, updated_at')
    .eq('profile_status', 'pending')
    .order('updated_at', { ascending: false })

  const t = await getTranslations('admin')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('pendingProfilesSection')}</h1>
        <Button variant="outline" asChild>
          <Link href="/admin/dashboard">{t('backToDashboard')}</Link>
        </Button>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          {t('profileReviewDesc')}
        </p>
        <ProfileReviewClient initialProfiles={pendingProfiles ?? []} />
      </Card>
    </div>
  )
}
