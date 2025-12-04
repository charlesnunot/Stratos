// js/auth.js
const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu'; 
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// ===== 检查登录状态 =====
window.addEventListener('DOMContentLoaded', async () => {
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { alert(error.message); return; }

  if (!data.user.email_confirmed_at) {
    alert('Please verify your email before logging in.');
    return;
  }

  saveToken(data.session?.access_token || '');
  localStorage.setItem('username', email);
  showUser(email);
});

// ===== 注册 =====
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { alert(error.message); return; }

  alert('Registration successful! We have sent a verification link to your email. Please verify before logging in.');
  registerModal.style.display = 'none';
  loginModal.style.display = 'flex';
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
