// js/webMonitor.js
import { supabase } from './userService.js';

/**
 * 更新 web_monitor（含 status 与 actions）
 */
export async function updateWebMonitor(payload = {}) {
  const { data: session } = await supabase.auth.getSession();

  if (!session?.session?.user) {
    console.warn('updateWebMonitor：未登录，无法更新 web_monitor');
    return null;
  }

  const user = session.session.user;

  const updateData = {
    uid: user.id,
    current_page: payload.current_page ?? null,
    status: payload.status ?? null,
    actions: payload.actions ?? null,
    extra: payload.extra ?? null,
    device: "web",
    last_seen: new Date().toISOString()
  };

  // upsert 写入
  const { error } = await supabase
    .from('web_monitor')
    .upsert(updateData);

  if (error) {
    console.error('updateWebMonitor error:', error);
    return null;
  }

  return true;
}

/**
 * 获取当前用户的监控数据
 */
export async function getWebMonitor() {
  const { data: session } = await supabase.auth.getSession();

  if (!session?.session?.user) return null;

  const userId = session.session.user.id;

  const { data, error } = await supabase
    .from('web_monitor')
    .select('*')
    .eq('uid', userId)
    .single();

  if (error) {
    console.error('getWebMonitor error:', error);
    return null;
  }

  return data;
}

/**
 * 清除 web_monitor 中当前用户的在线记录
 */
export async function clearWebMonitor() {
  const { data: session } = await supabase.auth.getSession();

  if (!session?.session?.user) return null;

  const userId = session.session.user.id;

  const { error } = await supabase
    .from('web_monitor')
    .delete()
    .eq('uid', userId);

  if (error) {
    console.error('clearWebMonitor error:', error);
    return null;
  }

  return true;
}
