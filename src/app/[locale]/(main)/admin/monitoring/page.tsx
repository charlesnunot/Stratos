/**
 * Admin system monitoring dashboard page
 * Displays system metrics, health status, and cron job status
 * Server Component for authentication, Client Component for interactivity
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminMonitoringClient } from './AdminMonitoringClient'

export default async function AdminMonitoringPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/')
  }

  // Fetch initial monitoring data
  // For simplicity, we'll let the client component fetch the data
  // The server component handles authentication, client handles data fetching
  // This avoids cookie/header forwarding issues in Server Components
  const initialData = null
  const initialError = null

  return <AdminMonitoringClient initialData={initialData} initialError={initialError} />
}
