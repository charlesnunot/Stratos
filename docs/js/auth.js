import { initUser, setUser, getUser, updateUser, clearUser } from './userManager.js';

function initAuth() {
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const usernameEl = document.getElementById('username');
  const userInfo = document.getElementById('user-info');
  const logoutBtn = document.getElementById('logout-btn');
  const emailVerificationModal = document.getElementById('email-verification-modal');

  if (!usernameEl || !userInfo) return;

  function saveToken(token) { localStorage.setItem('authToken', token); }
  function getToken() { return localStorage.getItem('authToken'); }

  const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function getUserProfile(uid) {
    const { data } = await supabaseClient.from('user_profiles').select('*').eq('uid', uid).maybeSingle();
    return data || null;
  }

  const generateDefaultNickname = (email) => {
    const prefix = email.split('@')[0] || 'User';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefix.slice(0,5)}${randomNum}${prefix.slice(-1)}`;
  };

  async function upsertUserProfile(profile) {
    const { data } = await supabaseClient.from('user_profiles').upsert(profile, { onConflict: 'uid' }).select('*').maybeSingle();
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

  function showUser(nickname, avatarUrl) {
    usernameEl.textContent = nickname;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.src = avatarUrl;
    userInfo.style.display = 'flex';
    modalMask.style.display = 'none';
    registerModal.style.display = 'none';
  }

  const token = getToken();
  const username = localStorage.getItem('username');

  if (!token || !username) {
    modalMask.style.display = 'flex';
    loginModal.style.display = 'flex';
    registerModal.style.display = 'none';
    userInfo.style.display = 'none';
  } else showUser(username);

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data: sessionData, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { alert(error.message); return; }
    saveToken(sessionData?.access_token || '');
    localStorage.setItem('username', email);
    const userProfile = await getUserProfile(sessionData.user.id);
    const nickname = userProfile?.nickname || generateDefaultNickname(email);
    if (!userProfile) await upsertUserProfile({ uid: sessionData.user.id, nickname });
    const avatarUrl = await getUserAvatar(sessionData.user.id);
    showUser(nickname, avatarUrl);
  });

  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const messageEl = document.getElementById('register-message');
    messageEl.style.display = 'none'; messageEl.textContent = '';
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { messageEl.style.color='red'; messageEl.textContent=error.message; messageEl.style.display='block'; return; }
    emailVerificationModal.style.display='flex';
    modalMask.style.display='flex';
    registerModal.style.display='none';
  });

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

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');
      modalMask.style.display='flex';
      loginModal.style.display='flex';
      registerModal.style.display='none';
      userInfo.style.display='none';
    });
  }
}
