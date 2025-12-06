// js/webMonitor.js
import { supabase } from './supabaseClient.js';

export async function updateWebMonitor(payload) {
  const { data: session } = await supabase.auth.getSession();

  if (!session || !session.session || !session.session.user) {
    console.warn('updateWebMonitor：未登录，无法更新 web_monitor');
    return null;
  }

  const user = session.session.user;

  const { error } = await supabase
    .from('web_monitor')
    .upsert({
      uid: user.id,
      current_page: payload.current_page,
      extra: payload.extra ?? null,
      last_seen: new Date().toISOString()
    });

  if (error) {
    console.error('updateWebMonitor error:', error);
    return null;
  }

  return true;
}

export async function getWebMonitor() {
  const { data: session } = await supabase.auth.getSession();
  if (!session || !session.session || !session.session.user) return null;

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

export async function clearWebMonitor() {
  const { data: session } = await supabase.auth.getSession();
  if (!session || !session.session || !session.session.user) return null;

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

