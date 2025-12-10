// js/webMonitorService.js
import { supabase } from './userService.js';

/**
 * 更新当前用户 Web 在线状态
 * @param {string} uid - 用户 UID
 * @param {string} status - 状态，默认为 'online'，可选 'offline'
 * @returns {Promise<boolean>} 返回是否成功
 */
export async function updateWebStatus(uid, status = 'online') {
  if (!uid) {
    console.warn('updateWebStatus: uid 为空');
    return false;
  }

  try {
    await supabase
      .from('web_monitor')
      .upsert(
        {
          uid: uid,
          device: 'web',
          status: status,
          last_seen: new Date().toISOString()
        },
        { onConflict: ['uid', 'device'] }
      );
    return true;
  } catch (e) {
    console.error('更新 web_monitor 状态失败:', e);
    return false;
  }
}

