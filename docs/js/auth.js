// ===== DOM 元素 =====
const modalMask = document.getElementById('modal-mask');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const usernameEl = document.getElementById('username');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

// ===== token 操作 =====
function saveToken(token) { localStorage.setItem('authToken', token); }
function getToken() { return localStorage.getItem('authToken'); }
function clearToken() { 
  localStorage.removeItem('authToken'); 
  localStorage.removeItem('username'); 
}

// ===== 显示用户信息 =====
function showUser(email) {
  usernameEl.textContent = email;
  userInfo.style.display = 'flex';
  modalMask.style.display = 'none';
  loginModal.style.display = 'none';
  registerModal.style.display = 'none';
}

// ===== Supabase 初始化 =====
const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('Supabase 初始化完成', supabaseClient);

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

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { alert(error.message); return; }

  saveToken(data.session?.access_token || '');
  localStorage.setItem('username', email);
  showUser(email);
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

  // 显示注册成功消息
  messageEl.style.color = 'green';
  messageEl.textContent = 'Registration successful! Please verify your email before logging in.';
  messageEl.style.display = 'block';

  // 2秒后切换到登录模态
  setTimeout(() => {
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
    messageEl.style.display = 'none'; // 隐藏消息
  }, 2000);
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

// ===== 退出登录 =====
logoutBtn?.addEventListener('click', () => {
  clearToken();
  modalMask.style.display = 'flex';
  loginModal.style.display = 'flex';
  registerModal.style.display = 'none';
  userInfo.style.display = 'none';
});
