// js/monitorService.js
import { supabase } from './userService.js';

/**
 * 订阅指定用户的 App 状态变化
 * @param {string} userId 用户 ID
 * @param {(data: object) => void} callback 回调函数，直接返回表中最新数据
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
        // payload.new 是最新数据，payload.old 是旧数据
        if (payload.eventType === 'DELETE') {
          callback(null); // 表被删除，前端可以显示空或默认状态
        } else {
          callback(payload.new); // 直接返回最新数据
        }
      }
    )
    .subscribe();

  return channel;
}
