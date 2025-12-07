// js/rightPanel.js
import { getUser, clearUser } from './userManager.js';
import { subscribeAppStatus } from './monitorService.js';

let appStatusChannel = null; // 声明订阅通道

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

  // 更新 App 在线状态的 UI
  function updateAppStatusUI(status) {
    if (!appStatusEl) return;
    if (status.online) {
      appStatusEl.textContent = `Online (${status.page || 'Unknown page'})`;
      appStatusEl.style.color = 'green';
    } else {
      appStatusEl.textContent = 'Offline';
      appStatusEl.style.color = 'red';
    }
  }

  if (user && user.nickname) {
    if (usernameEl) usernameEl.textContent = user.nickname;
    if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
    if (userInfoEl) userInfoEl.style.display = 'flex';

    // 订阅实时 App 状态
    appStatusChannel = subscribeAppStatus(user.uid, updateAppStatusUI);
  } else if (userInfoEl) {
    userInfoEl.style.display = 'none';
  }

  // 登出操作
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      if (userInfoEl) userInfoEl.style.display = 'none';
      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';

      // 取消订阅 App 状态
      if (appStatusChannel) {
        supabase.removeChannel(appStatusChannel);
        appStatusChannel = null;
      }
    });
  }
}
