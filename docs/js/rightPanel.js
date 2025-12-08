// js/rightPanel.js
import { getUser, clearUser } from './userManager.js';
import { subscribeAppStatus, subscribeWebConfirm } from './monitorService.js';
import { supabase } from './userService.js';
import { WebMonitor } from './webMonitor.js';

let appStatusChannel = null;
let webConfirmChannel = null;

export function initRightPanel() {
  const userInfoEl = document.getElementById('user-info');
  const usernameEl = document.getElementById('username');
  const avatarEl = document.getElementById('user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const statusText = document.getElementById('app-status-text');
  const statusDot = document.getElementById('app-status-dot');

  const user = getUser();

  function debugLog(...args) {
    if (window && window.console) console.log('[rightPanel]', ...args);
  }

  function updateAppStatusUI(data) {
    if (!statusText || !statusDot) return;
    if (!data) {
      statusText.textContent = 'No data';
      statusDot.style.backgroundColor = '#888';
      return;
    }
    const status = data.status ?? 'unknown';
    statusText.textContent = `App: ${status}`;
    statusDot.style.backgroundColor = status === 'online' ? '#2ecc71' : '#888';
  }

  if (user && user.uid) {
    debugLog('User present, uid=', user.uid);
    if (usernameEl) usernameEl.textContent = user.nickname || 'Anonymous';
    if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
    if (userInfoEl) userInfoEl.style.display = 'flex';

    // ✅ 启动 Web 心跳
    WebMonitor.start();

    // 先 fetch 最新 App 状态
    (async () => {
      try {
        const { data, error } = await supabase
          .from('app_monitor')
          .select('*')
          .eq('uid', user.uid)
          .single();
        if (error) {
          debugLog('fetch app_monitor error:', error);
          updateAppStatusUI(null);
        } else {
          updateAppStatusUI(data);
        }
      } catch {
        updateAppStatusUI(null);
      }
    })();

    // 订阅实时 App 状态
    appStatusChannel = subscribeAppStatus(user.uid, (payloadNew) => {
      updateAppStatusUI(payloadNew);
    });

    // 订阅 web_confirm
    webConfirmChannel = subscribeWebConfirm(user.uid, (payloadNew) => {
      debugLog('web_confirm callback:', payloadNew);
    });

  } else {
    debugLog('No user found in rightPanel init');
    if (userInfoEl) userInfoEl.style.display = 'none';
  }

  // 登出操作
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const user = getUser();
      const uid = user?.uid;
    
      // 停止心跳
      WebMonitor.stop();
    
      // 设置 offline 并等待完成
      if (uid) {
        try {
          await supabase.from('web_monitor').upsert({
            uid,
            status: 'offline',
            last_seen: new Date()
          });
          console.log('User set offline on logout');
        } catch (err) {
          console.error('Error setting offline on logout:', err);
        }
      }
    
      // 清理用户信息
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');
    
      // 隐藏 UI
      userInfoEl.style.display = 'none';
      modalMask.style.display = 'flex';
      loginModal.style.display = 'flex';
      registerModal.style.display = 'none';
    
      // 取消订阅
      if (appStatusChannel) { try { supabase.removeChannel(appStatusChannel); } catch{} appStatusChannel = null; }
      if (webConfirmChannel) { try { supabase.removeChannel(webConfirmChannel); } catch{} webConfirmChannel = null; }
    });

  }
}
