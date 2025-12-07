// js/rightPanel.js
import { getUser, clearUser } from './userManager.js'
import { getAppStatus } from './monitorService.js';

export function initRightPanel() {
  const userInfoEl = document.getElementById('user-info');
  const usernameEl = document.getElementById('username');
  const avatarEl = document.getElementById('user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const appStatusEl = document.getElementById('app-status'); 

  const user = getUser();
  if (user && user.nickname) {
    if (usernameEl) usernameEl.textContent = user.nickname;
    if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
    if (userInfoEl) userInfoEl.style.display = 'flex';
    // 获取并显示 App 在线状态
    updateAppOnlineStatus(user.uid, appStatusEl);
    // 可选：定时刷新 App 状态，每 10 秒更新一次
    setInterval(() => updateAppOnlineStatus(user.uid, appStatusEl), 10000);
  } else if (userInfoEl) {
    userInfoEl.style.display = 'none';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      if (userInfoEl) userInfoEl.style.display = 'none';
      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';
    });
  }
}
