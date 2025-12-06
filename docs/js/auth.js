// ===== 初始化函数 =====
function initAuth() {
  console.log("initAuth 执行");

  // ===== DOM 元素 =====
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const usernameEl = document.getElementById('username');
  const userInfo = document.getElementById('user-info');
  const logoutBtn = document.getElementById('logout-btn');
  const emailVerificationModal = document.getElementById('email-verification-modal');

  if (!usernameEl || !userInfo) {
    console.error("必要元素未找到，auth.js 停止执行");
    return;
  }

  // ===== token 操作 =====
  function saveToken(token) { localStorage.setItem('authToken', token); }
  function getToken() { return localStorage.getItem('authToken'); }
  function clearToken() { 
    localStorage.removeItem('authToken'); 
    localStorage.removeItem('username'); 
  }

  // ===== Supabase 初始化 =====
  const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('Supabase 初始化完成', supabaseClient);

  // ===== 工具函数 =====
  async function getUserProfile(uid) {
    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('uid', uid)
        .maybeSingle();
      if (error) {
        console.error('获取用户资料失败:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('获取用户资料异常:', err);
      return null;
    }
  }

  const generateDefaultNickname = (email) => {
    if (!email || !email.includes('@')) return '新用户_' + Math.floor(Math.random() * 10000);
    const prefix = email.split('@')[0];
    const firstPart = prefix.slice(0, 5);
    const lastChar = prefix.slice(-1);
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${firstPart}${randomNum}${lastChar}`;
  };

  async function upsertUserProfile(profile) {
    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .upsert(profile, { onConflict: 'uid' })
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('Supabase 更新用户资料失败:', error.message);
        return null;
      }
      return data || null;
    } catch (err) {
      console.error('提交用户资料异常:', err);
      return null;
    }
  }

  async function getUserAvatar(uid) {
    try {
      const { data, error } = await supabaseClient
        .from('user_avatars')
        .select('avatar_url')
        .eq('uid', uid)
        .single();
      if (error || !data) {
        return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';
      }
      return data.avatar_url;
    } catch (err) {
      console.error('获取用户头像失败:', err);
      return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';
    }
  }

  function showUser(nickname, avatarUrl) {
    if (!nickname) {
      console.error('No username found');
      return;
    }
    usernameEl.textContent = nickname;
    const avatarElement = document.getElementById('user-avatar');
    if (avatarElement) avatarElement.src = avatarUrl;
    userInfo.style.display = 'flex';
    modalMask.style.display = 'none';
    registerModal.style.display = 'none';
  }

  // ===== 检查登录状态 =====
  const token = getToken();
  const username = localStorage.getItem('username');

  if (!token || !username) {
    modalMask.style.display = 'flex';
    loginModal.style.display = 'flex';
    registerModal.style.display = 'none';
    userInfo.style.display = 'none';
  } else {
    showUser(username);
  }

  // ===== 登录 =====
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data: sessionData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (loginError) {
      console.error('登录失败:', loginError.message);
      alert(loginError.message);
      return;
    }

    saveToken(sessionData?.access_token || '');
    localStorage.setItem('username', email);

    const user = sessionData.user;
    const userProfile = await getUserProfile(user.id);
    let nickname = userProfile?.nickname || generateDefaultNickname(user.email);

    if (!userProfile) {
      await upsertUserProfile({ uid: user.id, nickname });
    }

    const avatarUrl = await getUserAvatar(user.id);
    showUser(nickname, avatarUrl);
  });

  // ===== 注册 =====
  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const messageEl = document.getElementById('register-message');
    messageEl.style.display = 'none';
    messageEl.textContent = '';

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      messageEl.style.color = 'red';
      messageEl.textContent = error.message;
      messageEl.style.display = 'block';
      return;
    }

    emailVerificationModal.style.display = 'flex';
    modalMask.style.display = 'flex';
    registerModal.style.display = 'none';
  });

  // ===== 切换弹窗 =====
  document.getElementById('to-register')?.addEventListener('click', () => {
    loginModal.style.display = 'none';
    registerModal.style.display = 'flex';
  });
  document.getElementById('to-login')?.addEventListener('click', () => {
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
  });

  document.getElementById('go-to-login')?.addEventListener('click', () => {
    emailVerificationModal.style.display = 'none';
    loginModal.style.display = 'flex';
  });
}
