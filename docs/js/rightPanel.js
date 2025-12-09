// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, clearUser } from './userManager.js';

let webMonitorChannel = null;
let presenceChannel = null;

function getTabId() {
  let id = sessionStorage.getItem("web_tab_id");
  if (!id) {
    id = "tab-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem("web_tab_id", id);
  }
  return id;
}

async function updateWebMonitorDB(uid, online, device = 'web') {
  const { error } = await supabase
    .from("web_monitor")
    .upsert(
      { uid, device, status: online ? "online" : "offline", last_seen: new Date().toISOString() },
      { onConflict: ['uid', 'device'] }
    );
  if (error) console.error("web_monitor 更新失败:", error);
}

export async function initRightPanel() {
  const user = getUser();
  if (!user || !user.uid) return;

  const tabId = getTabId();
  console.log("This tab id =", tabId);

  const appStatusText = document.getElementById('app-status-text');
  const appStatusDot = document.getElementById('app-status-dot');

  // ------------------- 0️⃣ 获取当前 Web 状态 -------------------
  try {
    const { data, error } = await supabase
      .from('web_monitor')
      .select('*')
      .eq('uid', user.uid)
      .eq('device', 'web')
      .single();

    if (!error && data) {
      appStatusText.textContent = `Web: ${data.status}`;
      appStatusDot.style.backgroundColor = data.status === 'online' ? '#2ecc71' : '#888';
    } else {
      appStatusText.textContent = `Web: unknown`;
      appStatusDot.style.backgroundColor = '#888';
    }
  } catch (e) {
    console.warn("获取 Web 当前状态失败:", e);
    appStatusText.textContent = `Web: unknown`;
    appStatusDot.style.backgroundColor = '#888';
  }

  // ------------------- 1️⃣ Web Presence 订阅 -------------------
  presenceChannel = supabase.channel("web-presence", {
    config: { presence: { key: user.uid } }
  });

  await presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // 注册当前 Tab
      await presenceChannel.track({ tab_id: tabId, at: new Date().toISOString() });
      console.log("Presence subscribed for tab:", tabId);
    }
  });

  presenceChannel.on("presence", { event: "sync" }, async () => {
    const state = presenceChannel.presenceState();
    const userEntries = state[user.uid] ?? [];
    const online = userEntries.length > 0;
    await updateWebMonitorDB(user.uid, online, 'web');

    // 同步更新前端显示
    appStatusText.textContent = `Web: ${online ? 'online' : 'offline'}`;
    appStatusDot.style.backgroundColor = online ? '#2ecc71' : '#888';
  });

  // ------------------- 2️⃣ 订阅 web_monitor 表变化 -------------------
  webMonitorChannel = supabase
    .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'web_monitor',
        filter: `uid=eq.${user.uid}`,
      },
      (payload) => {
        const newData = payload.new;
        if (!newData) return;

        // 更新 Web 状态
        if (newData.device === 'web') {
          appStatusText.textContent = `Web: ${newData.status}`;
          appStatusDot.style.backgroundColor = newData.status === 'online' ? '#2ecc71' : '#888';
        }

        // 更新 APP 状态
        if (newData.device === 'app') {
          const appText = document.getElementById('app-status-text');
          const appDot = document.getElementById('app-status-dot');
          if (appText && appDot) {
            appText.textContent = `APP: ${newData.status}`;
            appDot.style.backgroundColor = newData.status === 'online' ? '#2ecc71' : '#888';
          }
        }
      }
    )
    .subscribe();

  // ------------------- 3️⃣ 初始化 Web 在线状态 -------------------
  await updateWebMonitorDB(user.uid, true, 'web');

  // ------------------- 4️⃣ 卸载 / 登出 -------------------
  window.addEventListener('beforeunload', async () => {
    if (presenceChannel) supabase.removeChannel(presenceChannel);
    if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
    if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
      if (user && user.uid) await updateWebMonitorDB(user.uid, false, 'web');

      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      const userInfoEl = document.getElementById('user-info');
      if (userInfoEl) userInfoEl.style.display = 'none';
    });
  }
}
