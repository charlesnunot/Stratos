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

/**
 * 订阅指定用户的 web_confirm 状态变化
 * @param {string} userId 用户 ID
 * @param {(data: object) => void} callback 回调函数，每当表有新增或更新时触发
 * @returns {object} channel 实例，可调用 unsubscribe() 取消订阅
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
      async (payload) => {
        console.log("web_confirm 数据变更:", payload);

        const newRow = payload.new;

        if (payload.eventType === 'DELETE') {
          callback(null);
          return;
        }

        if (newRow) {
          // 如果 status 是 pending，立即更新为 confirmed
          if (newRow.status === 'pending') {
            try {
              const { data, error } = await supabase
                .from('web_confirm')
                .update({ status: 'confirmed' })
                .eq('uid', userId)
                .select('*')
                .maybeSingle();

              if (error) {
                console.error('更新 web_confirm 状态失败:', error);
              } else {
                console.log('web_confirm 状态已更新为 confirmed:', data);
                callback(data); // 返回更新后的数据
                return;
              }
            } catch (err) {
              console.error('更新 web_confirm 异常:', err);
            }
          }

          // 否则直接返回当前行
          callback(newRow);
        }
      }
    )
    .subscribe((status) => {
      console.log("web_confirm 监控频道状态:", status);
    });

  return channel;
}
