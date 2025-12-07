// js/rightPanel.js
import { getUser, clearUser } from './userManager.js'
import { subscribeAppStatus } from './monitorService.js';

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
    // 订阅实时 App 状态
    appStatusChannel = subscribeAppStatus(user.uid, (status) => {
      if (!appStatusEl) return;
      if (status.online) {
        appStatusEl.textContent = `Online (${status.page || 'Unknown page'})`;
        appStatusEl.style.color = 'green';
      } else {
        appStatusEl.textContent = 'Offline';
        appStatusEl.style.color = 'red';
      }
    });
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
