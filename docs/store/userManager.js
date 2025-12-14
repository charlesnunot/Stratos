// docs/store/userManager.js

// 用户前端状态管理
let currentUser = null
const listeners = new Set()

// 通知所有订阅者
function notify() {
  listeners.forEach(cb => cb(currentUser))
}

// 设置当前用户
export function setUser(user) {
  currentUser = user
  notify()
}

// 清空当前用户
export function clearUser() {
  currentUser = null
  notify()
}

// 获取当前用户
export function getUser() {
  return currentUser
}

// 订阅用户变化
export function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
