import { supabase } from './userService.js';

/**
 * 订阅 web_monitor 表变化
 * @param {string} uid 用户ID
 * @param {(data: any) => void} callback 回调函数
 * @returns {() => void} 返回取消订阅函数
 */
export function subscribeWebMonitor(uid, callback) {
  const channel = supabase
    .channel(`web_monitor-${uid}`, { config: { broadcast: { self: true } } })
    .on(
      'postgres_changes',
      {
        event: '*',        // insert / update / delete
        schema: 'public',
        table: 'web_monitor',
        filter: `uid=eq.'${uid}'`,  // 字符串要加单引号
      },
      (payload) => {
        callback(payload.new); // payload.new 包含最新数据
      }
    )
    .subscribe((status) => {
      console.log(`web_monitor-${uid} 订阅状态:`, status);
    });

  return () => {
    supabase.removeChannel(channel);
    console.log(`web_monitor-${uid} 取消订阅`);
  };
}
