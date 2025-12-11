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

/* ----------------------------
   用户地址相关 API
---------------------------- */

/**
 * 获取用户地址列表
 * @param {string} uid - 用户 ID
 * @returns {Promise<Array>} - 返回地址对象数组
 */
export async function getUserAddresses(uid) {
  try {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取用户地址失败:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('获取用户地址异常:', err);
    return [];
  }
}

/**
 * 新增用户地址
 * @param {string} uid 用户 UID
 * @param {string} address 地址内容
 */
export async function addUserAddress(uid, address) {
  try {
    const { data, error } = await supabase
      .from('user_addresses')
      .insert([{ uid, address }])
      .select()
      .maybeSingle();

    if (error) {
      console.error('新增用户地址失败:', error.message);
      return null;
    }

    return data || null;
  } catch (err) {
    console.error('新增用户地址异常:', err);
    return null;
  }
}

/**
 * 更新用户地址
 * @param {number} id 地址 ID
 * @param {string} newAddress 新地址内容
 */
export async function updateUserAddress(id, newAddress) {
  try {
    const { error } = await supabase
      .from('user_addresses')
      .update({ address: newAddress })
      .eq('id', id);

    if (error) {
      console.error('更新用户地址失败:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('更新用户地址异常:', err);
    return false;
  }
}

/**
 * 删除用户地址
 * @param {number} id 地址 ID
 */
export async function deleteUserAddress(id) {
  try {
    const { error } = await supabase
      .from('user_addresses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除用户地址失败:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('删除用户地址异常:', err);
    return false;
  }
}


/**
 * 获取指定用户的系统消息
 * @param {string} userId 用户 ID
 * @returns {Promise<SystemMessage[]>} 系统消息数组
 */
export async function getSystemMessagesByUser(userId) {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("system_messages")
      .select(`
        *,
        system_message_metadata (*),
        system_message_reads (
          user_id,
          message_id,
          read_at
        )
      `)
      .or(`target_user.eq.${userId},target_user.is.null`) 
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Supabase error fetching system messages:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('获取系统消息异常:', err);
    return [];
  }
}

