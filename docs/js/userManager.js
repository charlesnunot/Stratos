// userManager.js
// 全局管理用户数据

// 当前用户信息（内存中）
let currentUser = null;

// 本地缓存 key
const LOCAL_STORAGE_KEY = 'currentUser';

/**
 * 初始化用户信息，从 localStorage 读取
 */
export function initUser() {
  const storedUser = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
    } catch (err) {
      console.error('解析本地用户数据失败', err);
      currentUser = null;
    }
  }
}

/**
 * 获取当前用户信息
 * @returns {Object|null} 用户信息或 null
 */
export function getUser() {
  return currentUser;
}

/**
 * 设置当前用户信息，并同步到 localStorage
 * @param {Object} user 用户对象
 */
export function setUser(user) {
  currentUser = user;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
}

/**
 * 更新用户信息（部分更新）
 * @param {Object} newData 新的数据，会合并到 currentUser
 */
export function updateUser(newData) {
  if (!currentUser) {
    console.warn('当前没有用户信息，无法更新');
    return;
  }
  currentUser = { ...currentUser, ...newData };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentUser));
}

/**
 * 清空用户信息（登出）
 */
export function clearUser() {
  currentUser = null;
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

