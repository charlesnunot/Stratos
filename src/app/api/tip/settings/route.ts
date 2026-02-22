import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 获取设置
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tip_enabled, tip_thank_you_message')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      enabled: profile?.tip_enabled ?? false,
      thankYouMessage: profile?.tip_thank_you_message || '',
    })
  } catch (error) {
    console.error('Error fetching tip settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 更新设置
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { enabled, thankYouMessage } = body

    const { error } = await supabase
      .from('profiles')
      .update({
        tip_enabled: enabled,
        tip_thank_you_message: thankYouMessage,
      })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating tip settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}