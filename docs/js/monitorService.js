// js/monitorService.js
import { supabase } from './userService.js';

/**
 * 获取指定用户 App 端在线状态
 */
export async function getAppStatus(userId) {
  const { data, error } = await supabase
    .from("app_monitor")
    .select("*")
    .eq("uid", userId)
    .single();

  if (error || !data) {
    return { online: false, page: null };
  }

  const lastSeen = new Date(data.last_seen).getTime();
  const online = (Date.now() - lastSeen) < 20000; // 最近 20 秒视为在线

  return { online, page: data.current_page };
}

/**
 * 更新右侧面板的 App 在线状态显示
 * @param {string} userId 用户 ID
 * @param {HTMLElement} appStatusEl 用于显示状态的 DOM 元素
 */
export async function updateAppOnlineStatus(userId, appStatusEl) {
  if (!appStatusEl) return;

  const dotEl = document.getElementById('app-status-dot');
  const textEl = document.getElementById('app-status-text');

  const status = await getAppStatus(userId);

  if (status.online) {
    if (dotEl) dotEl.style.backgroundColor = 'green';
    if (textEl) textEl.textContent = `Online (${status.page || 'Unknown page'})`;
  } else {
    if (dotEl) dotEl.style.backgroundColor = 'red';
    if (textEl) textEl.textContent = 'Offline';
  }

  /**
 * 订阅指定用户的 App 状态变化
 * @param {string} userId 用户 ID
 * @param {(newData: object) => void} callback 回调函数
 * @returns {object} channel 实例，可调用 unsubscribe() 取消订阅
 */
export function subscribeAppStatus(userId, callback) {
  const channel = supabase
    .channel(`app_monitor-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',        // 监听 insert / update / delete
        schema: 'public',
        table: 'app_monitor',
        filter: `uid=eq.${userId}`, // 只监听当前用户
      },
      (payload) => {
        // payload.new = 新数据（insert 或 update）
        // payload.old = 旧数据（update 或 delete）
        if (payload.eventType === 'DELETE') {
          callback({ online: false, page: null });
        } else {
          const lastSeen = new Date(payload.new.last_seen).getTime();
          const online = (Date.now() - lastSeen) < 20000; // 20 秒判断在线
          callback({ online, page: payload.new.current_page });
        }
      }
    )
    .subscribe();

  return channel;
}
}

