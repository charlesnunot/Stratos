// js/monitorService.js
import { supabase } from './userService.js';

/**
 * 订阅指定用户的 App 状态变化
 * @param {string} userId 用户 ID
 * @param {(data: object) => void} callback 回调函数
 * @returns {object} channel 实例，可调用 unsubscribe() 取消订阅
 */
export function subscribeAppStatus(userId, callback) {
  console.log("subscribeAppStatus 初始化 userId:", userId);

  const channel = supabase
    .channel(`app_monitor-${userId}`, {
      config: { broadcast: { self: true } }
    })
    .on(
      'postgres_changes',
      {
        event: '*',  // insert / update / delete
        schema: 'public',
        table: 'app_monitor',
        filter: `uid=eq.${userId}`,
      },
      (payload) => {
        console.log("收到数据库变更事件:", payload);

        if (payload.eventType === 'DELETE') {
          callback(null);
        } else {
          callback(payload.new);
        }
      }
    )
    .subscribe((status) => {
      console.log("监控频道状态:", status);
    });

  return channel;
}
