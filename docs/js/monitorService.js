// js/monitorService.js
import { supabase } from './userService.js';

/**
 * 订阅指定用户的 App 状态变化
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
        event: '*',
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

/**
 * 订阅指定用户的 web_confirm 变化
 * @param {string} userId 用户 ID
 * @param {(data: object) => void} callback 回调函数
 * @returns {object} channel 实例
 */
export function subscribeWebConfirm(userId, callback) {
  console.log("subscribeWebConfirm 初始化 userId:", userId);

  const channel = supabase
    .channel(`web_confirm-${userId}`, {
      config: { broadcast: { self: true } }
    })
    .on(
      'postgres_changes',
      {
        event: '*',  // insert / update / delete
        schema: 'public',
        table: 'web_confirm',
        filter: `uid=eq.${userId}`,
      },
      (payload) => {
        console.log("收到 web_confirm 数据变更事件:", payload);

        if (payload.eventType === 'DELETE') {
          callback(null);
        } else {
          callback(payload.new);
        }
      }
    )
    .subscribe((status) => {
      console.log("web_confirm 频道状态:", status);
    });

  return channel;
}
