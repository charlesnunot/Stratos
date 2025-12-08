// js/webMonitor.js
import { supabase } from './userService.js';

/**
 * Web 在线状态管理模块
 */
export const WebMonitor = (() => {
  const HEARTBEAT_INTERVAL = 10000; // 心跳间隔 10 秒
  const OFFLINE_THRESHOLD = 15000;  // 超过 15 秒未更新视为离线
  let heartbeatTimer = null;

  /**
   * 获取当前用户 uid
   */
  function getCurrentUid() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return null;
    try {
      return JSON.parse(currentUser).uid;
    } catch {
      return null;
    }
  }

  /**
   * 发送一次心跳，更新 web_monitor 表
   */
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

  /**
   * 启动心跳
   */
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

      await supabase.from('web_monitor').upsert({
        uid,
        status: 'offline',
        last_seen: new Date()
      });
    });
  }

  /**
   * 停止心跳
   */
  function stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  /**
   * 判断在线状态
   */
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
