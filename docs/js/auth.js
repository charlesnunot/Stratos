// ===== DOM 元素 =====
const modalMask = document.getElementById('modal-mask');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const usernameEl = document.getElementById('username');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const emailVerificationModal = document.getElementById('email-verification-modal');

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
console.log('Supabase 初始化function showUser(email) {完成', supabaseClient);

// 获取用户资料
async function getUserProfile(uid) {
  try {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('uid', uid)
      .maybeSingle(); // 只返回一个结果，如果没有则返回null

    if (error) {
      console.error('获取用户资料失败:', error.message);
      return null;
    }

    return data; // 返回用户资料
  } catch (err) {
    console.error('获取用户资料异常:', err);
    return null;
  }
}

// 生成默认昵称
const generateDefaultNickname = (email) => {
  if (!email || !email.includes('@')) return '新用户_' + Math.floor(Math.random() * 10000);

  const prefix = email.split('@')[0];
  const firstPart = prefix.slice(0, 5); // 前5个字母
  const lastChar = prefix.slice(-1);    // 最后一个字符
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4位随机数
  return `${firstPart}${randomNum}${lastChar}`; // 拼接结果
};

// 更新或插入用户资料
async function upsertUserProfile(profile) {
  try {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .upsert(profile, { onConflict: 'uid' })
      .select('*') // 必须传 string
      .maybeSingle();

    if (error) {
      console.error('Supabase 更新用户资料失败:', error.message);
      return null;
    }

    return data || null; // 返回数据，或者 null 如果没有成功
  } catch (err) {
    console.error('提交用户资料异常:', err);
    return null;
  }
}

// 获取用户头像
async function getUserAvatar(uid) {
  try {
    const { data, error } = await supabaseClient
      .from('user_avatars')  // 查询 user_avatars 表
      .select('avatar_url')  // 只选择 avatar_url 列
      .eq('uid', uid)  // 按用户 ID 查询
      .single();  // 获取单个结果

    if (error || !data) {
      // 如果出错或没有找到数据，返回默认头像
      return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';  // 默认头像 URL
    }

    return data.avatar_url;  // 返回用户的头像 URL
  } catch (err) {
    console.error('获取用户头像失败:', err);
    return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';  // 默认头像 URL
  }
}

// ===== 显示用户信息 =====
function showUser(nickname, avatarUrl) {
  if (!nickname) {
    console.error('No username found');
    return;
  }
  usernameEl.textContent = nickname;
  const avatarElement = document.getElementById('user-avatar');
  if (avatarElement) {
    avatarElement.src = avatarUrl;
  }
  userInfo.style.display = 'flex';
  modalMask.style.display = 'none';
  registerModal.style.display = 'none';
}


// ===== 检查登录状态 =====
window.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const username = localStorage.getItem('username');

  if (!token || !username) {
    // 未登录 → 打开登录窗口
    modalMask.style.display = 'flex';
    loginModal.style.display = 'flex';
    registerModal.style.display = 'none';
    userInfo.style.display = 'none';
  } else {
    // 已登录 → 显示用户信息
    showUser(username);
  }
});


// ===== 登录 =====
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  // 调用 Supabase 登录 API
  const { data: sessionData, error: loginError } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError) {
    console.error('登录失败:', loginError.message);
    alert(loginError.message);
    return;
  }

  // 登录成功，保存 token 并设置用户名
  saveToken(sessionData?.access_token || '');
  localStorage.setItem('username', email);

  console.log('登录成功, 返回的 sessionData:', sessionData);
  console.log('登录成功, 返回的 access_token:', sessionData?.access_token);

  const user = sessionData.user;
  const userProfile = await getUserProfile(user.id);
  console.log('userProfile:', userProfile);

  let nickname = user.email; 
  if (userProfile) {
    nickname = userProfile.nickname;
  }else{
    nickname = generateDefaultNickname(user.email);
    const updatedProfile = await upsertUserProfile({
      uid: user.id,
      nickname: nickname,
    });
  }
  let avatarUrl = await getUserAvatar(user.id);
  console.log('头像:', avatarUrl);
  showUser(nickname,avatarUrl);
});


// ===== 注册 =====
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const messageEl = document.getElementById('register-message');

  // 清空上一次消息
  messageEl.style.display = 'none';
  messageEl.textContent = '';

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) { 
    messageEl.style.color = 'red';
    messageEl.textContent = error.message;
    messageEl.style.display = 'block';
    return; 
  }

  // 显示邮箱验证提示模态
  document.getElementById('email-verification-modal').style.display = 'flex';
  document.getElementById('modal-mask').style.display = 'flex';

  // 隐藏注册模态
  document.getElementById('register-modal').style.display = 'none';
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

// ===== 点击 "Go to Login" =====
document.getElementById('go-to-login')?.addEventListener('click', () => {
  emailVerificationModal.style.display = 'none';
  loginModal.style.display = 'flex';
});
