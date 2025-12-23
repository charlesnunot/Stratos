// docs/store/subscribers.js
import { getCurrentUser, onAuthChange } from './supabase.js'
import { setUser, clearUser } from './userManager.js'
import { getUserProfile, getUserAvatar , getUserStats} from './api.js'

// 全局事件容器
const events = {}

// 订阅事件
export function subscribe(eventName, callback) {
  if (!events[eventName]) events[eventName] = new Set()
  events[eventName].add(callback)
  return () => events[eventName].delete(callback)
}

// 发布事件
export function publish(eventName, payload) {
  if (!events[eventName]) return
  events[eventName].forEach(cb => cb(payload))
}

/**
 * 构建前端统一 User 结构
 */
async function buildEnhancedUser(authUser) {
  if (!authUser) return null

  const uid = authUser.id

  const [profile, avatar, stats] = await Promise.all([
    getUserProfile(uid),
    getUserAvatar(uid),
    getUserStats(uid)
  ])

  return {
    ...authUser,
    profile,                // user_profiles 表
    avatar_url: avatar,      // 头像（有 fallback）
    stats           // { followers_count, following_count, likes_count }
  }
}

// 初始化用户状态订阅
export async function initAuthSubscribers() {
  // 1️⃣ 页面刷新 / 启动
  const authUser = await getCurrentUser()

  if (authUser) {
    const enhancedUser = await buildEnhancedUser(authUser)
    setUser(enhancedUser)
    publish('userChange', enhancedUser)
  } else {
    clearUser()
    publish('userChange', null)
  }

  // 2️⃣ 登录 / 登出监听
  onAuthChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      const enhancedUser = await buildEnhancedUser(session.user)
      setUser(enhancedUser)
      publish('userChange', enhancedUser)
    }

    if (event === 'SIGNED_OUT') {
      clearUser()
      publish('userChange', null)
    }
  })
}
