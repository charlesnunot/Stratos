// js/monitorService.js
import { supabase } from './supabaseClient.js';

/**
 * 检查 App 是否在线
 */
export async function getAppStatus(userId) {
  const { data, error } = await supabase
    .from("app_monitor")
    .select("*")
    .eq("uid", userId)
    .single();

  if (error || !data) {
    return {
      online: false,
      page: null,
      device: "app",
      extra: null
    };
  }

  const lastSeen = new Date(data.last_seen).getTime();
  const online = (Date.now() - lastSeen) < 20000; // < 20 秒视为在线

  return {
    online,
    page: data.current_page,
    device: data.device,
    extra: data.extra
  };
}

/**
 * Web 实时监听 App 状态变化（可选）
 */
export function subscribeAppStatus(callback) {
  return supabase.channel("monitor-app")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "app_monitor"
    }, (payload) => callback(payload.new))
    .subscribe();
}

