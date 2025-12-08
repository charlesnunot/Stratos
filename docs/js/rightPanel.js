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

  // App 状态显示元素（真正显示文字的两个）
  const statusText = document.getElementById('app-status-text');
  const statusDot = document.getElementById('app-status-dot');

  const user = getUser();

  /** 更新 App 状态 UI —— 不做计算，只直接显示 Realtime 数据 */
  function updateAppStatusUI(data) {
    if (!statusText || !statusDot) return;

    if (!data) {
      statusText.textContent = 'No data';
      statusDot.style.backgroundColor = '#888';
      return;
    }

    const page = data.current_page ?? 'Unknown page';
    const lastSeen = data.last_seen ?? '';
    const extra = data.extra ? JSON.stringify(data.extra) : '';

    statusText.textContent = `Page: ${page} | Last Seen: ${lastSeen} | Extra: ${extra}`;
    statusDot.style.backgroundColor = 'green';
  }

  // 用户已登录 → 显示资料 + 订阅 Realtime
  if (user && user.uid) {
    if (usernameEl) usernameEl.textContent = user.nickname || 'Anonymous';
    if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
    if (userInfoEl) userInfoEl.style.display = 'flex';

    // 订阅 app_monitor 的实时数据
    appStatusChannel = subscribeAppStatus(user.uid, updateAppStatusUI);
  } 
  // 没登录 → 隐藏用户信息栏
  else if (userInfoEl) {
    userInfoEl.style.display = 'none';
  }

  /** 登出操作 */
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      if (userInfoEl) userInfoEl.style.display = 'none';
      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';

      // 取消 Realtime 订阅
      if (appStatusChannel) {
        supabase.removeChannel(appStatusChannel);
        appStatusChannel = null;
      }
    });
  }
}
