// js/webMonitor.js
import { supabase } from './userService.js';

/**
 * Web 在线状态管理模块
 */
export const WebMonitor = (() => {
  const HEARTBEAT_INTERVAL = 10000; // 心跳间隔 10 秒
  const OFFLINE_THRESHOLD = 15000;  // 超过 15 秒未更新视为离线
  let heartbeatTimer = null;

  function getCurrentUid() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return null;
    try {
      return JSON.parse(currentUser).uid;
    } catch {
      return null;
    }
  }

  async function sendHeartbeat(currentPage = null, actions = null, extra = null) {
    const uid = getCurrentUid();
    if (!uid) return;

    const now = new Date();
    const updateData = {
      uid,
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
    const interval = options.interval ?? HEARTBEAT_INTERVAL;

    // ✅ 立即发送一次心跳
    sendHeartbeat(window.location.pathname);

    // 定时心跳
    heartbeatTimer = setInterval(() => {
      sendHeartbeat(window.location.pathname);
    }, interval);

    // 页面关闭或刷新时标记离线
    window.addEventListener('beforeunload', async () => {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;

      const uid = getCurrentUid();
      if (!uid) return;

      try {
        await supabase.from('web_monitor').upsert({
          uid,
          status: 'offline',
          last_seen: new Date()
        });
      } catch (err) {
        console.error('[WebMonitor] beforeunload offline error:', err);
      }
    });
  }

  function stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function checkStatus(lastSeen) {
    const now = new Date();
    const last = new Date(lastSeen);
    return now - last <= OFFLINE_THRESHOLD ? 'online' : 'offline';
  }

  return {
    start,
    stop,
    sendHeartbeat,
    checkStatus
  };
})();
