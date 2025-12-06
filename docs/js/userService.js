// js/userService.js
const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';

// 使用 window.supabase 方式（UMD）
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function defaultAvatar() {
  return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';
}

// 获取用户头像
export async function getUserAvatar(uid) {
  if (!uid) return defaultAvatar();
  try {
    const { data, error } = await supabase
      .from('user_avatars')
      .select('avatar_url')
      .eq('uid', uid);
    if (error || !data || data.length === 0) return defaultAvatar();
    return data[0].avatar_url;
  } catch (err) {
    console.error('获取用户头像失败:', err);
    return defaultAvatar();
  }
}

// 获取用户资料
export async function getUserProfile(uid) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('uid', uid)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data || null;
  } catch (err) {
    console.error('获取用户资料异常:', err);
    return null;
  }
}

// 提交或更新用户资料
export async function upsertUserProfile(profile) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(profile, { onConflict: 'uid' })
      .select('*')
      .maybeSingle();
    if (error) { console.error('更新用户资料失败:', error); return null; }
    return data || null;
  } catch (err) {
    console.error('提交用户资料异常:', err);
    return null;
  }
}
