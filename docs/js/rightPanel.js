i// // js/rightPanel.js
// import { getUser, clearUser } from './userManager.js';
// import { supabase } from './userService.js';
// import { getUserDeviceStatus } from './webMonitorHelper.js';

// let presenceChannel = null;

// // 为每个 Tab 生成唯一 ID（同用户多个 Tab 可区分）
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
//     .upsert(
//       { uid, device, status: online ? "online" : "offline", last_seen: new Date().toISOString() },
//       { onConflict: ['uid', 'device'] } // 复合主键i
//     );
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
//   const appStatusText = document.getElementById('app-status-text');
//   const appStatusDot = document.getElementById('app-status-dot');

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
//   presenceChannel = supabase.channel("web-presence", { config: { presence: { key: user.uid } } });
//   presenceChannel.subscribe(async (status) => {
//     if (status === "SUBSCRIBED") {
//       await presenceChannel.track({ tab_id: tabId, at: new Date().toISOString() });
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




// js/rightPanel.js
// import { supabase } from './userService.js';
// import { getUser, clearUser } from './userManager.js';

// let presenceChannel = null;
// let webMonitorChannel = null;

// // 为每个 Tab 生成唯一 ID（同用户多个 Tab 可区分）
// function getTabId() {
//   let id = sessionStorage.getItem("web_tab_id");
//   if (!id) {
//     id = "tab-" + Math.random().toString(36).slice(2);
//     sessionStorage.setItem("web_tab_id", id);
//   }
//   return id;
// }

// // 更新 Web 在线状态到数据库（用于 Presence）
// async function updateWebMonitorDB(uid, online) {
//   try {
//     const { error } = await supabase
//       .from("web_monitor")
//       .upsert(
//         { uid, device: 'web', status: online ? "online" : "offline", last_seen: new Date().toISOString() },
//         { onConflict: ['uid', 'device'] }
//       );

//     if (error) console.error("web_monitor 更新失败:", error);
//   } catch (err) {
//     console.error("web_monitor 更新异常:", err);
//   }
// }

// export async function initRightPanel() {
//   const user = getUser();
//   if (!user || !user.uid) return;

//   const tabId = getTabId();
//   console.log("This tab id =", tabId);

//   const appStatusText = document.getElementById('app-status-text');
//   const appStatusDot = document.getElementById('app-status-dot');

//   // ------------------- 1️⃣ 登录后立即更新 Web 状态为 online -------------------
//   await updateWebMonitorDB(user.uid, true);

//   // ------------------- 2️⃣ 获取 APP 当前状态 -------------------
//   try {
//     const { data: appData, error: appError } = await supabase
//       .from('web_monitor')
//       .select('*')
//       .eq('uid', user.uid)
//       .eq('device', 'app')
//       .single();

//     if (!appError && appData) {
//       appStatusText.textContent = `APP: ${appData.status}`;
//       appStatusDot.style.backgroundColor = appData.status === 'online' ? '#2ecc71' : '#888';
//     } else {
//       appStatusText.textContent = `APP: offline`;
//       appStatusDot.style.backgroundColor = '#888';
//     }
//   } catch (e) {
//     console.warn("获取 APP 当前状态失败:", e);
//     appStatusText.textContent = `APP: offline`;
//     appStatusDot.style.backgroundColor = '#888';
//   }

//   // ------------------- 3️⃣ 订阅 APP 状态变化 -------------------
//   webMonitorChannel = supabase
//     .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
//     .on(
//       'postgres_changes',
//       {
//         event: '*',
//         schema: 'public',
//         table: 'web_monitor',
//         filter: `uid=eq.${user.uid},device=eq.app`, // 只监听 APP
//       },
//       (payload) => {
//         const newData = payload.new;
//         if (!newData) return;

//         appStatusText.textContent = `APP: ${newData.status}`;
//         appStatusDot.style.backgroundColor = newData.status === 'online' ? '#2ecc71' : '#888';
//       }
//     )
//     .subscribe();

//   // ------------------- 4️⃣ Web Presence 订阅 -------------------
//   presenceChannel = supabase.channel("web-presence", { config: { presence: { key: user.uid } } });

//   await presenceChannel.subscribe(async (status) => {
//     if (status === "SUBSCRIBED") {
//       await presenceChannel.track({ tab_id: tabId, at: new Date().toISOString() });
//       console.log("Presence subscribed for tab:", tabId);
//     }
//   });

//   presenceChannel.on("presence", { event: "sync" }, async () => {
//     const state = presenceChannel.presenceState();
//     const userEntries = state[user.uid] ?? [];
//     const online = userEntries.length > 0;
//     await updateWebMonitorDB(user.uid, online);
//   });

//   // ------------------- 5️⃣ 卸载 / 登出 -------------------
//   window.addEventListener('beforeunload', async () => {
//     if (presenceChannel) supabase.removeChannel(presenceChannel);
//     if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
//     if (user && user.uid) await updateWebMonitorDB(user.uid, false);
//   });

//   const logoutBtn = document.getElementById('logout-btn');
//   if (logoutBtn) {
//     logoutBtn.addEventListener('click', async () => {
//       if (presenceChannel) supabase.removeChannel(presenceChannel);
//       if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
//       if (user && user.uid) await updateWebMonitorDB(user.uid, false);

//       clearUser();
//       localStorage.removeItem('authToken');
//       localStorage.removeItem('username');

//       const userInfoEl = document.getElementById('user-info');
//       if (userInfoEl) userInfoEl.style.display = 'none';
//     });
//   }
// }



// js/rightPanel.js
// js/rightPanel.js
// js/rightPanel.js
// import { supabase } from './userService.js';
// import { getUser, clearUser } from './userManager.js';

// let presenceChannel = null;
// let webMonitorChannel = null;
// let webLogoutChannel = null;

// // 为每个 Tab 生成唯一 ID（同用户多个 Tab 可区分）
// function getTabId() {
//   let id = sessionStorage.getItem("web_tab_id");
//   if (!id) {
//     id = "tab-" + Math.random().toString(36).slice(2);
//     sessionStorage.setItem("web_tab_id", id);
//   }
//   return id;
// }

// // 更新 Web 在线状态到数据库（用于 Presence）
// async function updateWebMonitorDB(uid, online) {
//   try {
//     const { error } = await supabase
//       .from("web_monitor")
//       .upsert(
//         { uid, device: 'web', status: online ? "online" : "offline", last_seen: new Date().toISOString() },
//         { onConflict: ['uid', 'device'] }
//       );

//     if (error) console.error("web_monitor 更新失败:", error);
//   } catch (err) {
//     console.error("web_monitor 更新异常:", err);
//   }
// }

// // ✅ 执行本地登出（页面状态 + 清理 localStorage）
// function performLogout() {
//   // 清理本地用户状态
//   clearUser();
//   localStorage.removeItem('authToken');
//   localStorage.removeItem('username');

//   // 隐藏右侧用户信息
//   const userInfoEl = document.getElementById('user-info');
//   if (userInfoEl) userInfoEl.style.display = 'none';

//   // 显示登录弹窗
//   const modalMask = document.getElementById('modal-mask');
//   const loginModal = document.getElementById('login-modal');
//   const registerModal = document.getElementById('register-modal');

//   if (modalMask) modalMask.style.display = 'flex';
//   if (loginModal) loginModal.style.display = 'flex';
//   if (registerModal) registerModal.style.display = 'none';
// }

// export async function initRightPanel() {
//   const user = getUser();
//   if (!user || !user.uid) return;

//   const tabId = getTabId();
//   console.log("This tab id =", tabId);

//   const appStatusText = document.getElementById('app-status-text');
//   const appStatusDot = document.getElementById('app-status-dot');

//   // ------------------- 1️⃣ 登录后立即更新 Web 状态为 online -------------------
//   await updateWebMonitorDB(user.uid, true);

//   // ------------------- 2️⃣ 获取 APP 当前状态 -------------------
//   try {
//     const { data: appData, error: appError } = await supabase
//       .from('web_monitor')
//       .select('*')
//       .eq('uid', user.uid)
//       .eq('device', 'app')
//       .single();

//     if (!appError && appData) {
//       appStatusText.textContent = `APP: ${appData.status}`;
//       appStatusDot.style.backgroundColor = appData.status === 'online' ? '#2ecc71' : '#888';
//     } else {
//       appStatusText.textContent = `APP: offline`;
//       appStatusDot.style.backgroundColor = '#888';
//     }
//   } catch (e) {
//     console.warn("获取 APP 当前状态失败:", e);
//     appStatusText.textContent = `APP: offline`;
//     appStatusDot.style.backgroundColor = '#888';
//   }

//   // ------------------- 3️⃣ 订阅 APP 状态变化 -------------------
//   webMonitorChannel = supabase
//     .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
//     .on(
//       'postgres_changes',
//       {
//         event: '*',
//         schema: 'public',
//         table: 'web_monitor',
//         filter: `uid=eq.${user.uid},device=eq.app`,
//       },
//       (payload) => {
//         const newData = payload.new;
//         if (!newData) return;

//         appStatusText.textContent = `APP: ${newData.status}`;
//         appStatusDot.style.backgroundColor = newData.status === 'online' ? '#2ecc71' : '#888';
//       }
//     )
//     .subscribe();

//   // ------------------- 4️⃣ Web Presence 订阅 -------------------
//   presenceChannel = supabase.channel("web-presence", { config: { presence: { key: user.uid } } });

//   await presenceChannel.subscribe(async (status) => {
//     if (status === "SUBSCRIBED") {
//       await presenceChannel.track({ tab_id: tabId, at: new Date().toISOString() });
//       console.log("Presence subscribed for tab:", tabId);
//     }
//   });

//   presenceChannel.on("presence", { event: "sync" }, async () => {
//     const state = presenceChannel.presenceState();
//     const userEntries = state[user.uid] ?? [];
//     const online = userEntries.length > 0;
//     await updateWebMonitorDB(user.uid, online);
//   });

//   // ------------------- 5️⃣ 卸载 / 登出 -------------------
//   window.addEventListener('beforeunload', async () => {
//     if (presenceChannel) supabase.removeChannel(presenceChannel);
//     if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
//     if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
//     if (user && user.uid) await updateWebMonitorDB(user.uid, false);
//   });

//   const logoutBtn = document.getElementById('logout-btn');
//   if (logoutBtn) {
//     logoutBtn.addEventListener('click', async () => {
//       if (presenceChannel) supabase.removeChannel(presenceChannel);
//       if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
//       if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
//       if (user && user.uid) await updateWebMonitorDB(user.uid, false);

//       performLogout();
//     });
//   }

//   // ------------------- 6️⃣ 远程登出订阅 -------------------
//   if (!webLogoutChannel) {
//     webLogoutChannel = supabase
//       .channel(`web_monitor_remote-${user.uid}`, { config: { broadcast: { self: true } } })
//       .on(
//         'postgres_changes',
//         {
//           event: '*',
//           schema: 'public',
//           table: 'web_monitor',
//           filter: `uid=eq.${user.uid},device=eq.web`
//         },
//         (payload) => {
//           console.log('✅ Remote logout payload received:', payload);
//           const newData = payload.new;
//           if (!newData) return;

//           if (newData.status === 'offline') {
//             console.log('🔴 Web is remotely logged out! Performing local logout...');
//             performLogout();
//           }
//         }
//       )
//       .subscribe(); // 注意：不要加 .then()

//     console.log('🔔 Remote logout channel initialized.');
//   }
// }







// js/rightPanel.js
// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, clearUser } from './userManager.js';

let presenceChannel = null;
let webMonitorChannel = null;
let webLogoutChannel = null;

function getTabId() {
  let id = sessionStorage.getItem("web_tab_id");
  if (!id) {
    id = "tab-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem("web_tab_id", id);
  }
  return id;
}

async function updateWebMonitorDB(uid, online) {
  try {
    const { error } = await supabase
      .from("web_monitor")
      .upsert(
        {
          uid,
          device: 'web',
          status: online ? "online" : "offline",
          last_seen: new Date().toISOString()
        },
        { onConflict: ['uid', 'device'] }
      );
    if (error) console.error("web_monitor 更新失败:", error);
  } catch (err) {
    console.error("web_monitor 更新异常:", err);
  }
}

// 本地登出逻辑，不跳转，直接隐藏右侧面板 + 弹窗
function performLogoutUIOnly() {
  clearUser();
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');

  const userInfoEl = document.getElementById('user-info');
  if (userInfoEl) userInfoEl.style.display = 'none';

  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');

  if (modalMask) modalMask.style.display = 'flex';
  if (loginModal) loginModal.style.display = 'flex';
  if (registerModal) registerModal.style.display = 'none';
}

export async function initRightPanel() {
  const user = getUser(); 
  if (!user || !user.uid) return;
  console.log("user 对象:", user);      

  const tabId = getTabId();
  console.log("This tab id =", tabId);

  const appStatusText = document.getElementById('app-status-text');
  const appStatusDot = document.getElementById('app-status-dot');

  // 1️⃣ 登录后立即更新 Web 状态为 online
  await updateWebMonitorDB(user.uid, true);

  // 2️⃣ 获取 APP 当前状态
  try {
    const { data: appData, error: appError } = await supabase
      .from('web_monitor')
      .select('*')
      .eq('uid', user.uid)
      .eq('device', 'app')
      .single();

    if (!appError && appData) {
      appStatusText.textContent = `APP: ${appData.status}`;
      appStatusDot.style.backgroundColor = appData.status === 'online' ? '#2ecc71' : '#888';
    } else {
      appStatusText.textContent = `APP: offline`;
      appStatusDot.style.backgroundColor = '#888';
    }
  } catch (e) {
    console.warn("获取 APP 当前状态失败:", e);
    appStatusText.textContent = `APP: offline`;
    appStatusDot.style.backgroundColor = '#888';
  }

  // 3️⃣ 订阅 APP 状态变化
  webMonitorChannel = supabase
    .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'web_monitor',
        filter: `uid=eq.${user.uid},device=eq.app`
      },
      (payload) => {
        const newData = payload.new;
        if (!newData) return;

        appStatusText.textContent = `APP: ${newData.status}`;
        appStatusDot.style.backgroundColor = newData.status === 'online' ? '#2ecc71' : '#888';
      }
    )
    .subscribe();

  // 4️⃣ Web Presence 订阅
  presenceChannel = supabase.channel("web-presence", { config: { presence: { key: user.uid } } });
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
    await updateWebMonitorDB(user.uid, online);
  });

  // 5️⃣ 卸载 / 登出
  window.addEventListener('beforeunload', async () => {
    if (presenceChannel) supabase.removeChannel(presenceChannel);
    if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
    if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
    if (user && user.uid) await updateWebMonitorDB(user.uid, false);
  });

  // Logout 按钮事件
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
      if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
      if (user && user.uid) await updateWebMonitorDB(user.uid, false);

      performLogoutUIOnly();
    });
  }

  // 6️⃣ 远程登出订阅id
  if (!webLogoutChannel) {
    webLogoutChannel = supabase
      .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
      .on(id
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'web_monitor',
          filter: `uid=eq.${user.uid},device=eq.web`
        },
        (payload) => {
          console.log('-------------------------------------------------------------');
          console.log('✅ Remote logout payload received:', payload);
          const newData = payload.new;
          console.log('🔍 newData:', newData);

          if (!newData) {
            console.log('⚠️ newData is null, skipping logout');
            return;
          }

          if (newData.status === 'offline') {
            console.log('🔴 Remote logout: triggering Logout button...');
            const logoutBtn = document.getElementById('logout-btn');
            console.log('Logout button:', logoutBtn);
            if (logoutBtn) logoutBtn.click(); // 模拟点击
          }
        }
      )
      .subscribe();

    console.log('🔔 Remote logout channel initialized.');
  }
}
