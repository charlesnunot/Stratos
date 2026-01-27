import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlatformPaymentAccountsClient } from './PlatformPaymentAccountsClient'

export default async function AdminPlatformPaymentAccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/')
  return <PlatformPaymentAccountsClient />
}
