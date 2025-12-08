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

  // App 状态显示元素
  const statusText = document.getElementById('app-status-text');
  const statusDot = document.getElementById('app-status-dot');

  const user = getUser();

  // 调试用：打印 helper
  function debugLog(...args) {
    if (window && window.console) {
      console.log('[rightPanel]', ...args);
    }
  }

  /** 更新 App 状态 UI —— 直接展示传入的数据（或显示无数据） */
  function updateAppStatusUI(data) {
    debugLog('updateAppStatusUI called with:', data);

    if (!statusText || !statusDot) {
      debugLog('statusText/statusDot elements not found');
      return;
    }

    if (!data) {
      statusText.textContent = 'No data';
      statusDot.style.backgroundColor = '#888';
      return;
    }

    // 如果后端存 extra 是字符串形式（eg. '"{\"heartbeat\": true}"'），尽量解析
    let extraStr = '';
    try {
      if (data.extra == null) {
        extraStr = '';
      } else if (typeof data.extra === 'string') {
        // 尝试 JSON.parse，如果失败就直接使用原字符串
        try {
          const parsed = JSON.parse(data.extra);
          extraStr = JSON.stringify(parsed);
        } catch (e) {
          extraStr = data.extra;
        }
      } else {
        extraStr = JSON.stringify(data.extra);
      }
    } catch (e) {
      extraStr = String(data.extra);
    }

    const page = data.current_page ?? 'Unknown page';
    const lastSeen = data.last_seen ?? '';
    statusText.textContent = `Page: ${page} | Last Seen: ${lastSeen} | Extra: ${extraStr}`;
    statusDot.style.backgroundColor = '#2ecc71';
  }

  // 如果用户存在，显示用户信息并订阅 Realtime
  if (user && user.uid) {
    debugLog('User present, uid=', user.uid);
    if (usernameEl) usernameEl.textContent = user.nickname || 'Anonymous';
    if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
    if (userInfoEl) userInfoEl.style.display = 'flex';

    // ① 先 fetch 一次最新数据（确保初始状态不是 Checking...）
    (async () => {
      try {
        debugLog('Fetching current app_monitor row for uid=', user.uid);
        const { data, error } = await supabase
          .from('app_monitor')
          .select('*')
          .eq('uid', user.uid)
          .single();

        if (error) {
          debugLog('fetch app_monitor error:', error);
          // 显示无数据
          updateAppStatusUI(null);
        } else {
          debugLog('fetch app_monitor data:', data);
          updateAppStatusUI(data);
        }
      } catch (err) {
        debugLog('fetch app_monitor exception:', err);
        updateAppStatusUI(null);
      }
    })();

    // ② 订阅实时 App 状态（payload 会被回调直接显示）
    appStatusChannel = subscribeAppStatus(user.uid, (payloadNew) => {
      debugLog('Realtime callback payloadNew:', payloadNew);
      updateAppStatusUI(payloadNew);
    });

    // 订阅返回值也打印（以便调试）
    debugLog('appStatusChannel:', appStatusChannel);
  } else {
    debugLog('No user found in rightPanel init');
    if (userInfoEl) userInfoEl.style.display = 'none';
  }

  // 登出操作：清理并取消订阅
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      debugLog('logout clicked - clearing user and unsubscribing channel');
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      if (userInfoEl) userInfoEl.style.display = 'none';
      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';

      if (appStatusChannel) {
        try {
          supabase.removeChannel(appStatusChannel);
          debugLog('Removed appStatusChannel');
        } catch (err) {
          debugLog('Error removing channel:', err);
        }
        appStatusChannel = null;
      }
    });
  }
}
