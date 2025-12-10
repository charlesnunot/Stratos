// js/logout.js
import { supabase } from './userService.js';
import { getUser, clearUser } from './userManager.js';

/**
 * 退出登录函数
 * @param {Array} channels 要取消的 Supabase 订阅通道
 */
export async function performLogout(channels = []) {
  const user = getUser();

  // 1️⃣ 取消所有订阅通道
  channels.forEach(channel => {
    if (channel) supabase.removeChannel(channel);
  });

  // 2️⃣ 更新数据库状态为 offline
  if (user && user.uid) {
    try {
      await supabase
        .from('web_monitor')
        .upsert(
          {
            uid: user.uid,
            device: 'web',
            status: 'offline',
            last_seen: new Date().toISOString()
          },
          { onConflict: ['uid', 'device'] }
        );
    } catch (e) {
      console.error('更新 web_monitor 状态失败:', e);
    }
  }

  // 3️⃣ 清除本地用户信息
  clearUser();
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');

  // 4️⃣ 显示登录界面
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const userInfoEl = document.getElementById('user-info');

  if (modalMask) modalMask.style.display = 'flex';
  if (loginModal) loginModal.style.display = 'flex';
  if (registerModal) registerModal.style.display = 'none';
  if (userInfoEl) userInfoEl.style.display = 'none';
}

