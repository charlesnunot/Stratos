// docs/store/subscribers.js
import { getCurrentUser, onAuthChange } from './supabase.js'
import { setUser, clearUser } from './userManager.js'
import { getUserAvatar } from './api.js'   // ✅ 新增这一行

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

// 初始化用户状态订阅
export async function initAuthSubscribers() {
  // 1️⃣ 页面刷新 / 启动时
  const user = await getCurrentUser()

  if (user) {
    const avatar = await getUserAvatar(user.id)

    const enhancedUser = {
      ...user,
      avatar_url: avatar
    }

    setUser(enhancedUser)
    publish('userChange', enhancedUser)
  } else {
    clearUser()
    publish('userChange', null)
  }

  // 2️⃣ 监听登录 / 登出
  onAuthChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      const avatar = await getUserAvatar(session.user.id)

      const enhancedUser = {
        ...session.user,
        avatar_url: avatar
      }

      setUser(enhancedUser)
      publish('userChange', enhancedUser)
    }

    if (event === 'SIGNED_OUT') {
      clearUser()
      publish('userChange', null)
    }
  })
}
