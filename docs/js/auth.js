// js/auth.js
import { setUser, getUser } from './userManager.js';
import { supabase, getUserAvatar, getUserProfile, upsertUserProfile } from './userService.js';
import { getAppStatus } from './monitorService.js';

function generateDefaultNickname(email) {
  const prefix = email.split('@')[0] || 'User';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix.slice(0,5)}${randomNum}${prefix.slice(-1)}`;
}

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
  const token = localStorage.getItem('authToken');
  const user = getUser();

  if (!token || !user) {
    document.getElementById('modal-mask').style.display = 'flex';
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('register-modal').style.display = 'none';
  } else {
    updateUI(user);
  }

  // 登录
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data: sessionData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { alert(error.message); return; }

    localStorage.setItem('authToken', sessionData?.access_token || '');
    let userProfile = await getUserProfile(sessionData.user.id);
    const nickname = userProfile?.nickname || generateDefaultNickname(email);
    if (!userProfile) userProfile = await upsertUserProfile({ uid: sessionData.user.id, nickname });
    const avatarUrl = await getUserAvatar(sessionData.user.id);

    setUser({ uid: sessionData.user.id, email, nickname, avatarUrl, accessToken: sessionData?.access_token });
    updateUI(getUser());
    await updateAppOnlineStatus(uid);
  });

  // 注册
  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const messageEl = document.getElementById('register-message');
    if (messageEl) { messageEl.style.display='none'; messageEl.textContent=''; }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (messageEl) { messageEl.style.color='red'; messageEl.textContent=error.message; messageEl.style.display='block'; }
      return;
    }

    document.getElementById('email-verification-modal').style.display='flex';
    document.getElementById('modal-mask').style.display='flex';
    document.getElementById('register-modal').style.display='none';
  });
}
