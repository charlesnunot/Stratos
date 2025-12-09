import { supabase } from './userService.js';

/**
 * 查询某个用户所有设备在线状态
 * @param {string} uid - 用户 ID
 * @returns {Promise<Object>} 例如 { web: 'online', app: 'offline' }
 */
export async function getUserDeviceStatus(uid) {
  if (!uid) return {};

  const { data, error } = await supabase
    .from('web_monitor')
    .select('device, status')
    .eq('uid', uid);

  if (error) {
    console.error('获取用户设备状态失败:', error);
    return {};
  }

  const statusMap = {};
  data.forEach(item => {
    statusMap[item.device] = item.status;
  });

  return statusMap;
}

/**
 * 更新 UI 显示用户多设备状态
 * @param {string} uid - 用户 ID
 * @param {HTMLElement} containerEl - 容器元素
 */
export async function updateDeviceStatusUI(uid, containerEl) {
  if (!uid || !containerEl) return;

  const statusMap = await getUserDeviceStatus(uid);
  // 清空容器
  containerEl.innerHTML = '';

  for (const [device, status] of Object.entries(statusMap)) {
    const el = document.createElement('div');
    el.textContent = `${device}: ${status}`;
    el.style.color = status === 'online' ? '#2ecc71' : '#888';
    containerEl.appendChild(el);
  }
}

