// docs/store/supabase.js
const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu'

// 创建唯一 Supabase 客户端
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)

// -----------------------------
// Auth 基础方法
// -----------------------------

// 获取当前 session
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[Auth] getSession error:', error)
    return null
  }
  return data.session
}

// 获取当前用户
export async function getCurrentUser() {
  const session = await getSession()
  return session ? session.user : null
}

// 监听登录 / 登出事件
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}

// 主动登出
export async function signOut() {
  await supabase.auth.signOut()
}

// -----------------------------
// 登录 / 注册
// -----------------------------

// 登录
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    console.error('[Auth] signIn error:', error)
    throw error
  }

  return data.user
}

// 注册
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  if (error) {
    console.error('[Auth] signUp error:', error)
    throw error
  }

  return data.user
}
