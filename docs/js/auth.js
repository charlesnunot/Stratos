const modalMask = document.getElementById('modal-mask');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const usernameEl = document.getElementById('username');
const userInfo = document.getElementById('user-info');

// 保存 token
function saveToken(token) {
  localStorage.setItem('authToken', token);
}

// 获取 token
function getToken() {
  return localStorage.getItem('authToken');
}

// 清除 token（登出用）
function clearToken() {
  localStorage.removeItem('authToken');
}


// 检查登录状态
const token = getToken();

if (!token) {
  // 没有 token，显示登录 modal
  modalMask.style.display = 'flex';
  loginModal.style.display = 'flex';
  registerModal.style.display = 'none';
  userInfo.style.display = 'none';
} else {
  // 有 token，显示用户信息
  const username = localStorage.getItem('username') || 'User';
  usernameEl.textContent = username;
  userInfo.style.display = 'flex';
}


// 登录按钮
document.getElementById('login-btn')?.addEventListener('click', () => {
  const email = document.getElementById('login-email').value;
  if(!email){ alert('Please enter email'); return; }
  localStorage.setItem('loggedInUser', email);
  modalMask.style.display = 'none';
  usernameEl.textContent = email;
  userInfo.style.display = 'flex';
});

// 注册按钮
document.getElementById('register-btn')?.addEventListener('click', () => {
  const email = document.getElementById('register-email').value;
  if(!email){ alert('Please enter email'); return; }
  localStorage.setItem('loggedInUser', email);
  modalMask.style.display = 'none';
  usernameEl.textContent = email;
  userInfo.style.display = 'flex';
});

// 切换到注册弹窗
document.getElementById('to-register')?.addEventListener('click', () => {
  loginModal.style.display = 'none';
  registerModal.style.display = 'flex';
});

// 切换到登录弹窗
document.getElementById('to-login')?.addEventListener('click', () => {
  registerModal.style.display = 'none';
  loginModal.style.display = 'flex';
});
