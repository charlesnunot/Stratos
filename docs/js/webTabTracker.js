/**
 * webTabTracker.js
 * 管理同一用户在浏览器中的多个标签页
 * 仅负责本地标签页状态，不涉及登录或后端
 */

const TAB_KEY = 'web_tabs';
const TAB_ID = Date.now() + Math.random().toString(16);

/**
 * 注册当前标签页
 */
export function registerTab() {
  const tabs = JSON.parse(localStorage.getItem(TAB_KEY) || '[]');
  if (!tabs.includes(TAB_ID)) {
    tabs.push(TAB_ID);
    localStorage.setItem(TAB_KEY, JSON.stringify(tabs));
  }

  // 标签页关闭时自动注销
  window.addEventListener('beforeunload', unregisterTab);

  // 监听其他标签页变化
  window.addEventListener('storage', handleStorageChange);
}

/**
 * 注销当前标签页
 */
function unregisterTab() {
  const tabs = JSON.parse(localStorage.getItem(TAB_KEY) || '[]');
  const newTabs = tabs.filter(id => id !== TAB_ID);
  localStorage.setItem(TAB_KEY, JSON.stringify(newTabs));
}

/**
 * 监听 localStorage 变化（其他标签页关闭时触发）
 */
function handleStorageChange(event) {
  if (event.key !== TAB_KEY) return;
  const tabs = JSON.parse(event.newValue || '[]');
  console.log('当前标签页总数:', tabs.length);
}

/**
 * 获取当前标签页数量
 */
export function getTabCount() {
  const tabs = JSON.parse(localStorage.getItem(TAB_KEY) || '[]');
  return tabs.length;
}
