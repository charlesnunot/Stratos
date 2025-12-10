// js/auth.js
import { setUser, getUser } from './userManager.js';
import { supabase, getUserAvatar, getUserProfile, upsertUserProfile } from './userService.js';
import { initRightPanel } from './rightPanel.js';
import { loginWithEmail } from './login.js';
import { registerWithEmail } from './register.js';

// 生成默认昵称
function generateDefaultNickname(email) {
  const prefix = email.split('@')[0] || 'User';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix.slice(0,5)}${randomNum}${prefix.slice(-1)}`;
}

// 更新页面 UI
function updateUI(user) {
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const usernameEl = document.getElementById('username');
  const avatarEl = document.getElementById('user-avatar');
  const userInfo = document.getElementById('user-info');

  if (!user) return;
  if (usernameEl) usernameEl.textContent = user.nickname;
  if (avatarEl) avatarEl.src = user.avatarUrl;
  if (userInfo) userInfo.style.display = 'flex';
  if (modalMask) modalMask.style.display = 'none';
  if (loginModal) loginModal.style.display = 'none';
  if (registerModal) registerModal.style.display = 'none';
}

export async function initAuth() {
  let user = getUser();
  const token = localStorage.getItem('authToken');
  const user = getUser();

  // 如果未登录，显示登录弹窗
  if (!token || !user) {
    document.getElementById('modal-mask').style.display = 'flex';
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('register-modal').style.display = 'none';
  } else {
    // 已登录，初始化右侧面板
    updateUI(user);
    await initRightPanel();
    return user;
  }

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      const user = await loginWithEmail(email, password);
      // 更新 UI
      updateUI(user);
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    try {
      await registerWithEmail(email, password);
      // 显示邮箱验证提示
      document.getElementById('email-verification-modal').style.display = 'flex';
    } catch (err) {
      const messageEl = document.getElementById('register-message');
      if (messageEl) {
        messageEl.style.color = 'red';
        messageEl.textContent = err.message;
        messageEl.style.display = 'block';
      }
    }
  });
}
