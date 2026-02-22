import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminSubscriptionsClient } from './AdminSubscriptionsClient'

export default async function AdminSubscriptionsPage() {
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

  if (profile?.role !== 'admin') {
    redirect('/')
  }

  return <AdminSubscriptionsClient />
}
