// js/monitorService.js
import { supabase } from './supabaseClient.js';

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
  
  const status = await getAppStatus(userId);

  if (status.online) {
    appStatusEl.textContent = `App 状态：在线 (${status.page || '未知页面'})`;
    appStatusEl.style.color = 'green';
  } else {
    appStatusEl.textContent = 'App 状态：离线';
    appStatusEl.style.color = 'red';
  }
}
