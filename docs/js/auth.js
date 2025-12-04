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
console.log('Supabase 初始化完成', supabaseClient);

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
      .upsert(profile, { onConflict: 'uid' }) // 如果 uid 冲突，则更新
      .select('*') // 获取完整的资料
      .maybeSingle(); // 获取单个记录

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

// ===== 显示用户信息 =====
function showUser(email) {
  usernameEl.textContent = email;
  userInfo.style.display = 'flex';
  modalMask.style.display = 'none';
  loginModal.style.display = 'none';
  registerModal.style.display = 'none';
}

// ===== 检查登录状态 =====
window.addEventListener('DOMContentLoaded', () => {
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

// 显示和隐藏侧边栏的更多菜单
document.getElementById('more-button').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('show-more');
});

// 退出登录按钮
document.getElementById('logout-btn').addEventListener('click', () => {
  clearToken();
  modalMask.style.display = 'flex';
  loginModal.style.display = 'flex';
  registerModal.style.display = 'none';
  userInfo.style.display = 'none';
});

// ===== 点击 "Go to Login" =====
document.getElementById('go-to-login')?.addEventListener('click', () => {
  emailVerificationModal.style.display = 'none';
  loginModal.style.display = 'flex';
});
