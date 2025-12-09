import { getUser, clearUser } from './userManager.js';
import { supabase } from './userService.js';
import { getUserDeviceStatus } from './webMonitorHelper.js';

let presenceChannel = null;

// 为每个 Tab 生成唯一 ID（同用户多个 Tab 也能区分）
function getTabId() {
  let id = sessionStorage.getItem("web_tab_id");
  if (!id) {
    id = "tab-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem("web_tab_id", id);
  }
  return id;
}

// 写入 web_monitor 表，支持多设备
export async function updateWebMonitorDB(uid, online, device = 'web') {
  const { error } = await supabase
    .from("web_monitor")
    .upsert({
      uid,
      device,
      status: online ? "online" : "offline",
      last_seen: new Date().toISOString(),
    }, { onConflict: ['uid', 'device'] }); // 复合主键

  if (error) console.error("web_monitor 更新失败:", error);
}

// 初始化右侧面板
export async function initRightPanel() {
  const userInfoEl = document.getElementById('user-info');
  const usernameEl = document.getElementById('username');
  const avatarEl = document.getElementById('user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const webStatusText = document.getElementById('app-status-text');  // Web 状态
  const webStatusDot = document.getElementById('app-status-dot');    // Web 状态
  const appStatusContainer = document.getElementById('app-device-status'); // 新增：显示 APP 状态

  function debugLog(...args) {
    if (window && window.console) console.log('[rightPanel]', ...args);
  }

  async function updateAppStatus() {
    if (!webStatusText) return;
    const uid = getUser()?.uid;
    if (!uid) return;

    const statusMap = await getUserDeviceStatus(uid);
    const appStatus = statusMap['app'] || 'offline';
    webStatusText.textContent = `APP: ${appStatus}`;
    webStatusDot.style.backgroundColor = isOnline ? '#2ecc71' : '#888';
  }

  const user = getUser();
  if (!user || !user.uid) {
    if (userInfoEl) userInfoEl.style.display = 'none';
    return;
  }

  // 显示用户信息
  if (usernameEl) usernameEl.textContent = user.nickname || 'Anonymous';
  if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
  if (userInfoEl) userInfoEl.style.display = 'flex';

  const tabId = getTabId();
  debugLog("This tab id =", tabId);

  // 登录成功，立即更新数据库为 online（Web 设备）
  await updateWebMonitorDB(user.uid, true, 'web');
  updateWebStatus(true);

  // 初次刷新 APP 状态
  await updateAppStatus();

  // 定时刷新 APP 状态（每 5 秒）
  const appStatusInterval = setInterval(updateAppStatus, 5000);

  // ---------- Presence 订阅（Web 在线状态） ----------
  presenceChannel = supabase.channel("web-presence", {
    config: { presence: { key: user.uid } }
  });

  presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // track 时写入 tabId
      await presenceChannel.track({
        tab_id: tabId,
        at: new Date().toISOString()
      });
      debugLog("Presence subscribed for tab:", tabId);
    }
  });

  presenceChannel.on("presence", { event: "sync" }, async () => {
    const state = presenceChannel.presenceState();
    const userEntries = state[user.uid] ?? [];
    const online = userEntries.length > 0;

    // UI 更新
    updateWebStatus(online);
    debugLog("Presence sync:", state);

    // 更新数据库状态（Web 设备）
    await updateWebMonitorDB(user.uid, online, 'web');
  });
  // ---------- Presence 订阅结束 ----------

  // 登出
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        if (presenceChannel) supabase.removeChannel(presenceChannel);
      } catch {}

      // 更新数据库为 offline（Web 设备）
      if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');

      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      if (userInfoEl) userInfoEl.style.display = 'none';
      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';

      clearInterval(appStatusInterval); // 停止刷新 APP 状态
    });
  }

  // 页面关闭或刷新时，也自动 offline（Web 设备）
  window.addEventListener('beforeunload', async () => {
    if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');
    clearInterval(appStatusInterval);
  });
}
