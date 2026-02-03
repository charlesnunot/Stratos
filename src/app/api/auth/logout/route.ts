import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withApiLogging, logAuthAction } from '@/lib/api/logger'

/**
 * 登出处理
 * 
 * 链路追踪：
 * - 入口：前端调用 POST /api/auth/logout
 * - 处理：调用 Supabase signOut 清除 session
 * - 日志：记录登出动作、用户ID、状态（不记录敏感信息）
 */
async function logoutHandler(request: NextRequest) {
  const supabase = await createClient()
  
  // 获取当前用户信息用于日志记录（在登出前）
  let userId: string | undefined
  try {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id
  } catch {
    // 用户可能已经没有有效 session
  }
  
  try {
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('[auth/logout] SignOut error:', error.message)
      // 记录失败的登出尝试
      logAuthAction({
        action: 'logout',
        userId,
        status: 'failed',
        error: error.message,
      })
      return NextResponse.json(
        { success: false, error: '登出失败，请重试' },
        { status: 500 }
      )
    }
    
    // 记录成功的登出
    logAuthAction({
      action: 'logout',
      userId,
      status: 'success',
    })
    
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[auth/logout] Exception:', err?.message || err)
    // 记录异常
    logAuthAction({
      action: 'logout',
      userId,
      status: 'failed',
      error: err?.message || 'Unknown error',
    })
    return NextResponse.json(
      { success: false, error: '登出时发生错误' },
      { status: 500 }
    )
  }
}

export const POST = withApiLogging(logoutHandler)
