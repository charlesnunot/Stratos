// docs/store/pageStateStore.js

// 内存缓存所有页面状态
const pageStates = {}

/**
 * 保存页面状态
 * @param {string} pageName 页面标识，如 'home' 或 'profile'
 * @param {object} state 页面状态对象
 */
export function savePageState(pageName, state) {
  if (!pageName || !state) return
  pageStates[pageName] = state
  console.log('[pageStateStore] savePageState ->', pageName, state)
}

/**
 * 获取页面状态
 * @param {string} pageName 页面标识
 * @returns {object|null} 返回状态对象或 null
 */
export function getPageState(pageName) {
  return pageStates[pageName] || null
}

/**
 * 清空某个页面的状态
 */
export function clearPageState(pageName) {
  delete pageStates[pageName]
}

/**
 * 清空所有页面状态
 */
export function clearAllPageStates() {
  Object.keys(pageStates).forEach(key => delete pageStates[key])
}
