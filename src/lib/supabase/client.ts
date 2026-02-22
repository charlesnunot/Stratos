import { createBrowserClient } from '@supabase/ssr'

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * 获取全局 Supabase Client 单例
 * 用于统一管理 Supabase 客户端实例
 */
export function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient()
  }
  return supabaseInstance
}

/**
 * 重新创建 Supabase Client 实例
 * 用于在 JWT 更新后强制刷新 HTTP 连接池
 * 这是解决 Authority Drift 的关键步骤
 */
export function recreateSupabaseClient() {
  // 断开所有 Realtime 连接
  if (supabaseInstance) {
    supabaseInstance.removeAllChannels()
  }
  
  // 重建实例
  supabaseInstance = createClient()
  return supabaseInstance
}

/**
 * 重置 Supabase Client（用于测试或登出）
 */
export function resetSupabaseClient() {
  if (supabaseInstance) {
    supabaseInstance.removeAllChannels()
    supabaseInstance = null
  }
}
