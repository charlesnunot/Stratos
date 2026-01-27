import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminSupportClient } from './AdminSupportClient'

export default async function AdminSupportPage() {
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

  return (
    <AdminSupportClient userRole={profile.role as 'admin' | 'support'} />
  )
}
