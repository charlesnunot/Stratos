// js/userProfileSubscriber.js
import { supabase } from './userService.js';
import { setUser } from './userManager.js';

/**
 * 订阅 user_profiles 表的特定用户资料变化
 * @param {string} uid  当前用户 UID
 * @param {(profile)=>void} callback  数据更新回调
 * @returns {object} channelInstance 可用于 unsubscribe
 */
export function subscribeUserProfile(uid, callback) {
  console.log("🔔 初始化用户资料订阅 user_profiles:", uid);

  const channel = supabase
    .channel(`user_profile_${uid}`, {
      config: { broadcast: { self: false } }
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_profiles',
        filter: `uid=eq.${uid}`
      },
      (payload) => {
        console.log("📢 收到用户资料变化 payload:", payload);

        const newProfile = payload.new;
        if (!newProfile) return;

        // 更新本地存储的 user
        const user = JSON.parse(localStorage.getItem("currentUser")) || {};
        Object.assign(user, newProfile);
        setUser(user);

        // 回调给 UI
        callback(newProfile);
      }
    )
    .subscribe(status => {
      console.log("📡 user_profiles 订阅状态:", status);
    });

  return channel;
}

