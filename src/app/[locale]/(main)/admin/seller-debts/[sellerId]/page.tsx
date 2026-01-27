import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SellerDebtDetailsClient } from './SellerDebtDetailsClient'

export default async function SellerDebtDetailsPage({
  params,
}: {
  params: { sellerId: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/')
  return <SellerDebtDetailsClient sellerId={params.sellerId} />
}
