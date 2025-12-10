// js/subscribeUserAvatar.js
import { supabase } from './userService.js'; // 这里使用你 Web 端初始化的 supabase 实例

/**
 * 订阅 user_avatars 表变化
 * @param {string} uid 用户 ID
 * @param {(newUrl: string) => void} onChange 回调函数，收到新头像 URL 时触发
 * @returns {() => void} 取消订阅函数
 */
export function subscribeUserAvatar(uid, onChange) {
  const channel = supabase
    .channel(`user_avatar_${uid}`)
    .on(
      'postgres_changes',
      {
        event: '*',         // 监听 insert/update/delete
        schema: 'public',
        table: 'user_avatars',
        filter: `uid=eq.${uid}`, // 只监听当前用户
      },
      (payload) => {
        console.log('收到 user_avatars 更新:', payload);
        const newRow = payload.new;
        if (newRow && typeof newRow === 'object' && 'avatar_url' in newRow) {
          onChange(newRow.avatar_url);
        }
      }
    )
    .subscribe();

  // 返回取消订阅函数
  return () => {
    supabase.removeChannel(channel);
  };
}

