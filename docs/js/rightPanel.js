// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, clearUser } from './userManager.js';

let presenceChannel = null;
let webMonitorChannel = null;

// 为每个 Tab 生成唯一 ID（同用户多个 Tab 可区分）
function getTabId() {
  let id = sessionStorage.getItem("web_tab_id");
  if (!id) {
    id = "tab-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem("web_tab_id", id);
  }
  return id;
}

// 更新 Web 在线状态到数据库（用于 Presence）
async function updateWebMonitorDB(uid, online) {
  const { error } = await supabase
    .from("web_monitor")
    .upsert(
      { uid, device: 'web', status: online ? "online" : "offline", last_seen: new Date().toISOString() },
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

  // ------------------- 1️⃣ 获取 APP 当前状态 -------------------
  try {
    const { data: appData, error: appError } = await supabase
      .from('web_monitor')
      .select('*')
      .eq('uid', user.uid)
      .eq('device', 'app')   // ✅ 只获取 APP
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

  // ------------------- 2️⃣ 订阅 web_monitor 表变化（仅 APP） -------------------
  webMonitorChannel = supabase
  .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'web_monitor',
      // ✅ 关键修改：device='app' 要加单引号
      filter: `uid=eq.${user.uid},device=eq.'app'`,
    },
    (payload) => {
      const newData = payload.new;
      if (!newData) return;

      appStatusText.textContent = `APP: ${newData.status}`;
      appStatusDot.style.backgroundColor = newData.status === 'online' ? '#2ecc71' : '#888';
    }
  )
  .subscribe();

  // ------------------- 3️⃣ Web Presence 订阅（同步自己在线状态到数据库） -------------------
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

  // ------------------- 4️⃣ 卸载 / 登出 -------------------
  window.addEventListener('beforeunload', async () => {
    if (presenceChannel) supabase.removeChannel(presenceChannel);
    if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
    if (user && user.uid) await updateWebMonitorDB(user.uid, false);
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
      if (user && user.uid) await updateWebMonitorDB(user.uid, false);

      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      const userInfoEl = document.getElementById('user-info');
      if (userInfoEl) userInfoEl.style.display = 'none';
    });
  }
}
