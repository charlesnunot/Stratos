// js/subscribeWebMonitor.js
import { supabase } from './userService.js';

/**
 * 订阅 web_monitor 表变化（Web 端）
 * @param {string} uid 当前用户 ID
 * @param {(data: object) => void} callback 数据变化回调
 * @returns {() => void} 取消订阅函数
 */
export function subscribeWebMonitor(uid, callback) {
  if (!uid) return () => {};

  const channel = supabase
    .channel(`web_monitor-${uid}`, { config: { broadcast: { self: true } } })
    .on(
      'postgres_changes',
      {
        event: '*',          // insert / update / delete
        schema: 'public',
        table: 'web_monitor',
        filter: `uid=eq.${uid}`, // 只监听当前用户
      },
      (payload) => {
        if (!payload.new) return;
        callback(payload.new); // payload.new 是最新数据
      }
    )
    .subscribe((status) => {
      console.log('📡 WebMonitor Channel 状态:', status);
    });

  return () => {
    supabase.removeChannel(channel);
    console.log('📴 WebMonitor 取消订阅');
  };
}
