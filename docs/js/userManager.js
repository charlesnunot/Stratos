// js/userManager.js
let userData = null;

// 初始化用户状态（可选）
export function initUser(initialData = null) {
  userData = initialData;
}

// 设置用户信息
export function setUser(data) {
  userData = { ...data };
  localStorage.setItem('userData', JSON.stringify(userData));
}

// 获取用户信息
export function getUser() {
  if (!userData) {
    const stored = localStorage.getItem('userData');
    if (stored) userData = JSON.parse(stored);
  }
  return userData;
}

// 更新用户信息（部分字段）
export function updateUser(update) {
  userData = { ...getUser(), ...update };
  localStorage.setItem('userData', JSON.stringify(userData));
}

// 清除用户信息
export function clearUser() {
  userData = null;
  localStorage.removeItem('userData');
}
