// docs/store/subscribers.js
import { supabase, getCurrentUser, onAuthChange } from './supabase.js'
import { setUser, clearUser, getUser } from './userManager.js'

// 全局事件容器
const events = {}

/* =========================================================
   事件管理 API
   ========================================================= */

/**
 * 订阅事件
 * @param {string} eventName
 * @param {function} callback
 * @returns {function} 取消订阅函数
 */
export function subscribe(eventName, callback) {
  if (!events[eventName]) events[eventName] = new Set()
  events[eventName].add(callback)
  return () => events[eventName].delete(callback)
}

/**
 * 发布事件
 * @param {string} eventName
 * @param {any} payload
 */
export function publish(eventName, payload) {
  if (!events[eventName]) return
  events[eventName].forEach(cb => cb(payload))
}

/* =========================================================
   用户状态订阅初始化（监听 Supabase）
   ========================================================= */

export async function initAuthSubscribers() {
  // 1️⃣ 启动时同步当前用户状态
  const user = await getCurrentUser()
  if (user) {
    setUser(user)
    publish('userChange', user)
  } else {
    clearUser()
    publish('userChange', null)
  }

  // 2️⃣ 监听 Supabase 登录 / 登出事件
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
