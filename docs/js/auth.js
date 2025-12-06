// js/auth.js
import { initUser, setUser, getUser, updateUser, clearUser } from './userManager.js';

export async function initAuth() {
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const usernameEl = document.getElementById('username');
  const userInfo = document.getElementById('user-info');
  const logoutBtn = document.getElementById('logout-btn');
  const emailVerificationModal = document.getElementById('email-verification-modal');

  if (!usernameEl || !userInfo) return;

  const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function saveToken(token) { localStorage.setItem('authToken', token); }
  function getToken() { return localStorage.getItem('authToken'); }

  const generateDefaultNickname = (email) => {
    const prefix = email.split('@')[0] || 'User';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefix.slice(0,5)}${randomNum}${prefix.slice(-1)}`;
  };

  async function getUserProfile(uid) {
    const { data } = await supabaseClient.from('user_profiles').select('*').eq('uid', uid).maybeSingle();
    return data || null;
  }

  async function upsertUserProfile(profile) {
    const { data } = await supabaseClient.from('user_profiles')
      .upsert(profile, { onConflict: 'uid' })
      .select('*')
      .maybeSingle();
    return data || null;
  }

  async function getUserAvatar(uid) {
    try {
      const { data } = await supabaseClient.from('user_avatars').select('avatar_url').eq('uid', uid).single();
      return data?.avatar_url || 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';
    } catch {
      return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';
    }
  }

  // 页面显示用户信息
  function renderUserUI(user) {
    usernameEl.textContent = user.nickname;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.src = user.avatarUrl;
    userInfo.style.display = 'flex';
    modalMask.style.display = 'none';
    loginModal.style.display = 'none';
    registerModal.style.display = 'none';
  }

  // 初始化用户
  const token = getToken();
  const storedUser = getUser();

  if (!token || !storedUser) {
    modalMask.style.display = 'flex';
    loginModal.style.display = 'flex';
    registerModal.style.display = 'none';
    userInfo.style.display = 'none';
  } else {
    renderUserUI(storedUser);
  }

  // 登录逻辑
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data: sessionData, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { alert(error.message); return; }

    saveToken(sessionData?.access_token || '');
    localStorage.setItem('username', email);

    let userProfile = await getUserProfile(sessionData.user.id);
    const nickname = userProfile?.nickname || generateDefaultNickname(email);

    if (!userProfile) userProfile = await upsertUserProfile({ uid: sessionData.user.id, nickname });

    const avatarUrl = await getUserAvatar(sessionData.user.id);

    setUser({
      uid: sessionData.user.id,
      email,
      nickname,
      avatarUrl,
      accessToken: sessionData?.access_token || ''
    });

    renderUserUI(getUser());
  });

  // 注册逻辑
  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const messageEl = document.getElementById('register-message');
    messageEl.style.display = 'none'; messageEl.textContent = '';

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { 
      messageEl.style.color='red'; 
      messageEl.textContent=error.message; 
      messageEl.style.display='block'; 
      return; 
    }

    emailVerificationModal.style.display='flex';
    modalMask.style.display='flex';
    registerModal.style.display='none';
  });

  // 切换登录/注册
  document.getElementById('to-register')?.addEventListener('click', () => {
    loginModal.style.display='none';
    registerModal.style.display='flex';
  });
  document.getElementById('to-login')?.addEventListener('click', () => {
    registerModal.style.display='none';
    loginModal.style.display='flex';
  });
  document.getElementById('go-to-login')?.addEventListener('click', () => {
    emailVerificationModal.style.display='none';
    loginModal.style.display='flex';
  });

  // 登出
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');
      modalMask.style.display='flex';
      loginModal.style.display='flex';
      registerModal.style.display='none';
      userInfo.style.display='none';
    });
  }
}
