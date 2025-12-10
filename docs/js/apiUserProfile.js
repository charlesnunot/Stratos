// js/apiUserProfile.js
import { supabase } from './userService.js';

/**
 * 更新或创建用户资料（头像/昵称等）
 * @param {object} profile  { uid, avatar, nickname, ... }
 * @returns {object|null} 更新后的 user_profiles 数据
 */
export async function upsertUserProfile(profile) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(profile, { onConflict: 'uid' })
      .select('*')   // 返回完整行
      .maybeSingle();

    if (error) {
      console.error('Supabase 更新用户资料失败:', error.message);
      return null;
    }

    return data; // 成功返回 user_profiles
  } catch (err) {
    console.error('提交用户资料异常:', err);
    return null;
  }
}

