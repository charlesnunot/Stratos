import { supabase } from './userService.js';

export function subscribeWebMonitor(uid, callback) {
  const channel = supabase
    .channel(`web_monitor-${uid}`, { config: { broadcast: { self: true } } })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'web_monitor',
        filter: `uid=eq.${uid}`,
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

