// docs/store/subscribers.js
import { getCurrentUser, onAuthChange } from './supabase.js'
import { setUser, clearUser } from './userManager.js'

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
  // 启动时同步当前用户状态
  const user = await getCurrentUser()
  if (user) {
    setUser(user)
    publish('userChange', user)
  } else {
    clearUser()
    publish('userChange', null)
  }

  // 监听登录/登出事件
  onAuthChange((event, session) => {
    if (event === 'SIGNED_IN') {
      setUser(session.user)
      publish('userChange', session.user)
    }
    if (event === 'SIGNED_OUT') {
      clearUser()
      publish('userChange', null)
    }
  })
}
