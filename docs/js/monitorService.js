// js/monitorService.js
import { supabase } from './supabaseClient.js';

/**
 * 检查指定用户 App 端是否在线
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
