// docs/store/supabase.js

const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu'

// 1️⃣ 创建唯一 client
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)

/* =========================================================
   Auth – 单一真相源
   ========================================================= */

/**
 * 获取当前 session（是否登录的唯一判断）
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[Auth] getSession error:', error)
    return null
  }
  return data.session
}

/**
 * 获取当前用户（可能为 null）
 */
export async function getCurrentUser() {
  const session = await getSession()
  return session ? session.user : null
}

/**
 * 监听登录状态变化（登录 / 退出 / 刷新）
 */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}

/**
 * 主动退出登录
 */
export async function signOut() {
  await supabase.auth.signOut()
}
