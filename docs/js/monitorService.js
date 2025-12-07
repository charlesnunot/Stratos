// js/monitorService.js
import { supabase } from './userService.js';

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
        if (payload.eventType === 'DELETE') {
          callback({ online: false, page: null });
        } else {
          const lastSeen = new Date(payload.new.last_seen).getTime();
          const online = (Date.now() - lastSeen) < 20000; // 20 秒判断在线
          callback({ online, page: payload.new.current_page });
        }
      }
    )
    .subscribe();

  return channel;
}
