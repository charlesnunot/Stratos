// docs/store/userManager.js

let currentUser = null
const listeners = new Set()

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



