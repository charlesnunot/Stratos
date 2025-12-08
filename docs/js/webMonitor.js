import { getUser } from './userManager.js';
import { supabase } from './userService.js';

/**
 * Web 在线状态管理模块
 * 功能：
 *  - 心跳更新 online 状态
 *  - stop 心跳阻止更新
 *  - 登出或关闭页面自动标记 offline
 */
export const WebMonitor = (() => {
  const HEARTBEAT_INTERVAL = 10000; // 心跳间隔 10 秒
  let heartbeatTimer = null;
  let stopped = false;

  /** 发送一次心跳 */
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

    try {
      const { error } = await supabase.from('web_monitor').upsert(updateData);
      if (error) console.error('[WebMonitor] heartbeat error:', error);
    } catch (err) {
      console.error('[WebMonitor] heartbeat exception:', err);
    }
  }

  /** 启动心跳 */
  function start(options = {}) {
    stopped = false;
    const interval = options.interval ?? HEARTBEAT_INTERVAL;

    // 立即发送一次心跳
    sendHeartbeat(window.location.pathname);

    // 定时发送心跳
    heartbeatTimer = setInterval(() => {
      sendHeartbeat(window.location.pathname);
    }, interval);

    // 页面关闭或刷新时标记 offline
    window.addEventListener('beforeunload', async () => {
      await setOffline();
    });
  }

  /** 停止心跳，不再发送 online */
  function stop() {
    stopped = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  /** 设置当前用户为 offline */
  async function setOffline() {
    stop();
    const user = getUser();
    if (!user?.uid) return;

    try {
      await supabase.from('web_monitor').upsert({
        uid: user.uid,
        status: 'offline',
        last_seen: new Date()
      });
      console.log('[WebMonitor] user set offline:', user.uid);
    } catch (err) {
      console.error('[WebMonitor] setOffline error:', err);
    }
  }

  return {
    start,
    stop,
    sendHeartbeat,
    setOffline
  };
})();
