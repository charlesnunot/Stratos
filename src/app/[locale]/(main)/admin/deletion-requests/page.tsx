import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminDeletionRequestsClient } from './AdminDeletionRequestsClient'

export default async function AdminDeletionRequestsPage() {
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

  if (
    !profile ||
    (profile.role !== 'admin' && profile.role !== 'support')
  ) {
    redirect('/')
  }

  return <AdminDeletionRequestsClient />
}
