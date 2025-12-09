// import { getUser, clearUser } from './userManager.js';
// import { supabase } from './userService.js';
// import { getUserDeviceStatus } from './webMonitorHelper.js';

// let presenceChannel = null;

// // 为每个 Tab 生成唯一 ID（同用户多个 Tab 也能区分）
// function getTabId() {
//   let id = sessionStorage.getItem("web_tab_id");
//   if (!id) {
//     id = "tab-" + Math.random().toString(36).slice(2);
//     sessionStorage.setItem("web_tab_id", id);
//   }
//   return id;
// }

// // 写入 web_monitor 表，支持多设备
// export async function updateWebMonitorDB(uid, online, device = 'web') {
//   const { error } = await supabase
//     .from("web_monitor")
//     .upsert({
//       uid,
//       device,
//       status: online ? "online" : "offline",
//       last_seen: new Date().toISOString(),
//     }, { onConflict: ['uid', 'device'] }); // 复合主键

//   if (error) console.error("web_monitor 更新失败:", error);
// }

// // 初始化右侧面板
// export async function initRightPanel() {
//   const userInfoEl = document.getElementById('user-info');
//   const usernameEl = document.getElementById('username');
//   const avatarEl = document.getElementById('user-avatar');
//   const logoutBtn = document.getElementById('logout-btn');
//   const modalMask = document.getElementById('modal-mask');
//   const loginModal = document.getElementById('login-modal');
//   const registerModal = document.getElementById('register-modal');

//   const appStatusText = document.getElementById('app-status-text'); // 显示 APP 状态
//   const appStatusDot = document.getElementById('app-status-dot');   // 显示 APP 状态

//   function debugLog(...args) {
//     if (window && window.console) console.log('[rightPanel]', ...args);
//   }

//   // ---------- 更新 UI 显示 APP 在线状态 ----------
//   async function updateAppStatus() {
//     if (!appStatusText || !appStatusDot) return;
//     const uid = getUser()?.uid;
//     if (!uid) return;

//     const statusMap = await getUserDeviceStatus(uid);
//     const appStatus = statusMap['app'] || 'offline';

//     appStatusText.textContent = `APP: ${appStatus}`;
//     appStatusDot.style.backgroundColor = appStatus === 'online' ? '#2ecc71' : '#888';
//   }

//   const user = getUser();
//   if (!user || !user.uid) {
//     if (userInfoEl) userInfoEl.style.display = 'none';
//     return;
//   }

//   // 显示用户信息
//   if (usernameEl) usernameEl.textContent = user.nickname || 'Anonymous';
//   if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
//   if (userInfoEl) userInfoEl.style.display = 'flex';

//   const tabId = getTabId();
//   debugLog("This tab id =", tabId);

//   // 可选：Web 自己的 Presence 数据写入数据库（仅后台统计用）
//   await updateWebMonitorDB(user.uid, true, 'web');

//   // 初次刷新 APP 状态
//   await updateAppStatus();

//   // 定时刷新 APP 状态（每 5 秒）
//   const appStatusInterval = setInterval(updateAppStatus, 5000);

//   // ---------- Web Presence 订阅（后台统计） ----------
//   presenceChannel = supabase.channel("web-presence", {
//     config: { presence: { key: user.uid } }
//   });

//   presenceChannel.subscribe(async (status) => {
//     if (status === "SUBSCRIBED") {
//       await presenceChannel.track({
//         tab_id: tabId,
//         at: new Date().toISOString()
//       });
//       debugLog("Presence subscribed for tab:", tabId);
//     }
//   });

//   presenceChannel.on("presence", { event: "sync" }, async () => {
//     const state = presenceChannel.presenceState();
//     const userEntries = state[user.uid] ?? [];
//     const online = userEntries.length > 0;

//     // 后台统计：更新数据库（Web 设备状态）
//     await updateWebMonitorDB(user.uid, online, 'web');
//   });

//   // ---------- 登出 ----------
//   if (logoutBtn) {
//     logoutBtn.addEventListener('click', async () => {
//       try { if (presenceChannel) supabase.removeChannel(presenceChannel); } catch {}

//       if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');

//       clearUser();
//       localStorage.removeItem('authToken');
//       localStorage.removeItem('username');

//       if (userInfoEl) userInfoEl.style.display = 'none';
//       if (modalMask) modalMask.style.display = 'flex';
//       if (loginModal) loginModal.style.display = 'flex';
//       if (registerModal) registerModal.style.display = 'none';

//       clearInterval(appStatusInterval); // 停止刷新 APP 状态
//     });
//   }

//   // 页面关闭或刷新时，也自动 offline（Web 设备）
//   window.addEventListener('beforeunload', async () => {
//     if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');
//     clearInterval(appStatusInterval);
//   });
// }



// js/webMonitor.js
import { supabase } from './userService.js';
import { getUser, clearUser } from './userManager.js';

let presenceChannel = null;
let appStatusChannel = null;

// 为每个 Tab 生成唯一 ID（同用户多个 Tab 也能区分）
function getTabId() {
  let id = sessionStorage.getItem("web_tab_id");
  if (!id) {
    id = "tab-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem("web_tab_id", id);
  }
  return id;
}

// 写入 web_monitor 表
export async function updateWebMonitorDB(uid, online, device = 'web') {
  const { error } = await supabase
    .from("web_monitor")
    .upsert({
      uid,
      device,
      status: online ? "online" : "offline",
      last_seen: new Date().toISOString(),
    }, { onConflict: ['uid', 'device'] });

  if (error) console.error("web_monitor 更新失败:", error);
}

// 初始化右侧面板
export async function initRightPanel() {
  const user = getUser();
  if (!user || !user.uid) return;

  const tabId = getTabId();
  console.log("This tab id =", tabId);

  // ------------------- Web Presence 订阅 -------------------
  presenceChannel = supabase.channel("web-presence", {
    config: { presence: { key: user.uid } }
  });

  await presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await presenceChannel.track({ tab_id: tabId, at: new Date().toISOString() });
      console.log("Presence subscribed for tab:", tabId);
    }
  });

  presenceChannel.on("presence", { event: "sync" }, async () => {
    const state = presenceChannel.presenceState();
    const userEntries = state[user.uid] ?? [];
    const online = userEntries.length > 0;

    // 更新 Web 自身状态到数据库
    await updateWebMonitorDB(user.uid, online, 'web');
  });

  // ------------------- APP 状态订阅 -------------------
  appStatusChannel = supabase
    .channel(`app_status-${user.uid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'web_monitor',
        filter: `uid=eq.${user.uid},device=eq.app`,
      },
      (payload) => {
        const status = payload.new?.status;
        console.log("🔥 APP 状态更新:", status);
        const appStatusText = document.getElementById('app-status-text');
        const appStatusDot = document.getElementById('app-status-dot');
        if (appStatusText && appStatusDot) {
          appStatusText.textContent = `APP: ${status}`;
          appStatusDot.style.backgroundColor = status === 'online' ? '#2ecc71' : '#888';
        }
      }
    )
    .subscribe();

  // ------------------- 初始化 Web 在线状态 -------------------
  await updateWebMonitorDB(user.uid, true, 'web');

  // ------------------- 卸载 / 登出 -------------------
  window.addEventListener('beforeunload', async () => {
    if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      if (appStatusChannel) supabase.removeChannel(appStatusChannel);
      if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');

      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      const userInfoEl = document.getElementById('user-info');
      if (userInfoEl) userInfoEl.style.display = 'none';
    });
  }
}

