// docs/store/systemMessageStore.js

const state = {
  system: [],
  dynamic: []
}

const listeners = new Set()

function notify() {
  listeners.forEach(cb => cb(state))
}

export function setSystemMessages(type, list) {
  state[type] = list
  notify()
}

export function addSystemMessage(type, msg) {
  state[type] = [msg, ...state[type]]
  notify()
}

export function markMessageRead(type, messageId) {
  const list = state[type]
  const msg = list.find(m => m.id === messageId)
  if (msg) msg.is_read = true
  notify()
}

export function getSystemMessages(type) {
  return state[type] || []
}

export function getUnreadCount() {
  return (
    state.system.filter(m => !m.is_read).length +
    state.dynamic.filter(m => !m.is_read).length
  )
}

export function subscribeSystemMessages(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

