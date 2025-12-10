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


/**
 * 获取指定用户在 APP 设备上的在线状态，并更新页面右侧面板显示
 * @param {string} uid 用户 ID
 */
export async function getAppStatusAndUpdateUI(uid) {
  if (!uid) return;

  try {
    const { data: appStatusRow, error: appStatusError } = await supabase
      .from('web_monitor')
      .select('status')
      .eq('uid', uid)
      .eq('device', 'app')
      .single();

    if (appStatusError) {
      console.error('获取 app 在线状态失败:', appStatusError);
      return;
    }

    if (appStatusRow) {
      const appStatusText = document.getElementById('app-status-text');
      const appStatusDot = document.getElementById('app-status-dot');

      if (appStatusText) appStatusText.textContent = `APP: ${appStatusRow.status}`;
      if (appStatusDot) appStatusDot.style.backgroundColor =
        appStatusRow.status === 'online' ? '#2ecc71' : '#888';
    }
  } catch (err) {
    console.error('获取 app 状态异常:', err);
  }
}

