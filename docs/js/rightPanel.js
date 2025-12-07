// js/rightPanel.js
import { getUser, clearUser } from './userManager.js';
import { subscribeAppStatus } from './monitorService.js';
import { supabase } from './userService.js';

let appStatusChannel = null; // 订阅通道

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

  // 更新 App 状态 UI —— 直接显示表中数据
  function updateAppStatusUI(data) {
    if (!appStatusEl) return;

    if (!data) {
      // 表被删除或无数据
      appStatusEl.textContent = 'No data';
      appStatusEl.style.color = '#888';
      return;
    }

    // 直接展示字段
    const page = data.current_page ?? 'Unknown page';
    const lastSeen = data.last_seen ?? '';
    const extra = data.extra ? JSON.stringify(data.extra) : '';

    appStatusEl.textContent = `Page: ${page} | Last Seen: ${lastSeen} | Extra: ${extra}`;
    appStatusEl.style.color = 'black';
  }

  if (user && user.uid) {
    if (usernameEl) usernameEl.textContent = user.nickname || 'Anonymous';
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
