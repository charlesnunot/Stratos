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
   * 发送一次心跳，更新 web_monitor 表
   * @param {string} currentPage - 当前页面路径
   * @param {object|null} actions - 当前用户操作
   * @param {object|null} extra - 额外信息
   */
  async function sendHeartbeat(currentPage = null, actions = null, extra = null) {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return;

    const user = session.session.user;
    const now = new Date();

    const updateData = {
      uid: user.id,
      current_page: currentPage,
      actions: actions ?? null,
      extra: extra ?? null,
      device: 'web',
      last_seen: now,
      status: 'online'
    };

    const { error } = await supabase.from('web_monitor').upsert(updateData);
    if (error) console.error('WebMonitor heartbeat error:', error);
  }

  /**
   * 启动心跳
   * @param {object} options 可选参数
   *  - interval: 心跳间隔 ms
   */
  function start(options = {}) {
    const interval = options.interval ?? HEARTBEAT_INTERVAL;

    // 每隔 interval 发送心跳
    heartbeatTimer = setInterval(() => {
      sendHeartbeat(window.location.pathname);
    }, interval);

    // 页面关闭或刷新时标记离线
    window.addEventListener('beforeunload', async () => {
      clearInterval(heartbeatTimer);
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      await supabase.from('web_monitor').upsert({
        uid: session.session.user.id,
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
   * @param {string|Date} lastSeen - 数据库 last_seen 时间
   * @returns 'online' | 'offline'
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
