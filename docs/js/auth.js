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

// 初始化 Auth
export async function initAuth() {
  // 1️⃣ 读取本地 Supabase session 并恢复
  const tokenData = localStorage.getItem('sb-zquslphbmowkgrdlygza-auth-token');
  if (tokenData) {
    try {
      const session = JSON.parse(tokenData);
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });
    } catch (err) {
      console.warn('恢复 Supabase session 失败', err);
      localStorage.removeItem('sb-zquslphbmowkgrdlygza-auth-token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
    }
  }

  // 2️⃣ 获取本地存储用户
  const currentUser = getUser();
  const token = localStorage.getItem('authToken');

  // 3️⃣ 如果用户或 token 不存在，显示登录弹窗
  if (!token || !currentUser) {
    const modalMask = document.getElementById('modal-mask');
    const loginModal = document.getElementById('login-modal');
    if (modalMask) modalMask.style.display = 'flex';
    if (loginModal) loginModal.style.display = 'flex';
    return null;
  }

  // 4️⃣ 已登录，更新 UI 并初始化右侧面板
  updateUI(currentUser);
  try { await initRightPanel(); } catch (e) { console.warn(e); }

  return currentUser;
}

// ------------------------------
// 事件绑定：登录
// ------------------------------
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  try {
    const user = await loginWithEmail(email, password);
    // 保存到本地
    setUser(user);
    localStorage.setItem('authToken', user.access_token);
    // 更新 UI
    updateUI(user);
    // 初始化右侧面板
    await initRightPanel();
  } catch (err) {
    alert(err.message);
  }
});

// ------------------------------
// 事件绑定：注册
// ------------------------------
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  try {
    await registerWithEmail(email, password);
    // 显示邮箱验证提示
    const emailModal = document.getElementById('email-verification-modal');
    if (emailModal) emailModal.style.display = 'flex';
  } catch (err) {
    const messageEl = document.getElementById('register-message');
    if (messageEl) {
      messageEl.style.color = 'red';
      messageEl.textContent = err.message;
      messageEl.style.display = 'block';
    }
  }
});
