import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET(request: NextRequest) {
  console.log('GET /api/admin/subscriptions called')

  const result = await requireAdmin(request)
  if (!result.success) {
    console.log('Admin check failed:', result.response)
    return result.response
  }

  try {
    const supabaseAdmin = await getSupabaseAdmin()
    console.log('Supabase admin client created')

    const { data: subscriptions, error } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        profiles(id, username, display_name, role, seller_type)
      `)
      .order('created_at', { ascending: false })
      .limit(500)

    console.log('Subscriptions query result:', { data: subscriptions, error })

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    console.log('Returning subscriptions count:', subscriptions?.length || 0)
    return NextResponse.json(subscriptions || [])
  } catch (error) {
    console.error('Error in subscriptions API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
