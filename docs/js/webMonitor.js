// js/webMonitor.js
import { getUser } from './userManager.js';
import { supabase } from './userService.js';

export const WebMonitor = (() => {
  const HEARTBEAT_INTERVAL = 10000; // 10 秒
  let heartbeatTimer = null;
  let stopped = false;

  async function sendHeartbeat(currentPage = null, actions = null, extra = null) {
    if (stopped) return;

    const user = getUser();
    if (!user?.uid) return;

    const now = new Date();
    const updateData = {
      uid: user.uid,
      current_page: currentPage,
      actions: actions ?? null,
      extra: extra ?? null,
      device: 'web',
      last_seen: now,
      status: 'online'
    };

    const { error } = await supabase.from('web_monitor').upsert(updateData);
    if (error) console.error('[WebMonitor] heartbeat error:', error);
  }

  function start(options = {}) {
    stopped = false;
    const interval = options.interval ?? HEARTBEAT_INTERVAL;

    // 立即发送一次心跳
    sendHeartbeat(window.location.pathname);

    // 定时发送心跳
    heartbeatTimer = setInterval(() => {
      sendHeartbeat(window.location.pathname);
    }, interval);

    // 页面刷新或关闭时标记 offline
    window.addEventListener('beforeunload', async () => {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;

      const user = getUser();
      if (!user?.uid) return;

      try {
        await supabase.from('web_monitor').upsert({
          uid: user.uid,
          status: 'offline',
          last_seen: new Date()
        });
      } catch (err) {
        console.error('[WebMonitor] beforeunload set offline error:', err);
      }
    });
  }

  function stop() {
    stopped = true; // 阻止后续心跳
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  return {
    start,
    stop,
    sendHeartbeat
  };
})();
