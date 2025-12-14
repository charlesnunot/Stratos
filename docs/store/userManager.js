// docs/store/userManager.js

let currentUser = null
const listeners = new Set()

/* =========================================================
   基础 API
   ========================================================= */

export function setUser(user) {
  currentUser = user
  notify()
}

export function clearUser() {
  currentUser = null
  notify()
}

export function getUser() {
  return currentUser
}

/* =========================================================
   订阅 / 通知（核心）
   ========================================================= */

export function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notify() {
  listeners.forEach(cb => cb(currentUser))
}

