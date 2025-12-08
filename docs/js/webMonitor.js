import { supabase } from './userService.js';

/**
 * 更新 web_monitor（含 status 与 actions）
 */
export async function updateWebMonitor(payload = {}) {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) return null;

  const user = session.session.user;

  const updateData = {
    uid: user.id,
    current_page: payload.current_page ?? null,
    status: payload.status ?? 'online',
    actions: payload.actions ?? null,
    extra: payload.extra ?? null,
    device: "web"
  };

  const { error } = await supabase
    .from('web_monitor')
    .upsert(updateData);

  if (error) console.error('updateWebMonitor error:', error);

  return !error;
}

/**
 * 将当前用户的 status 更新为指定状态
 */
export async function setWebStatus(status = 'offline') {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) return null;

  const user = session.session.user;

  const { error } = await supabase
    .from('web_monitor')
    .update({ status })
    .eq('uid', user.id);

  if (error) console.error('setWebStatus error:', error);

  return !error;
}
