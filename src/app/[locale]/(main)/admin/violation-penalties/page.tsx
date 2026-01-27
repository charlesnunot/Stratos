import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminViolationPenaltiesClient } from './AdminViolationPenaltiesClient'

export default async function AdminViolationPenaltiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/')
  return <AdminViolationPenaltiesClient />
}
