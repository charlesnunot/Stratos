const modalMask = document.getElementById('modal-mask');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const usernameEl = document.getElementById('username');
const userInfo = document.getElementById('user-info');

// 检查登录状态
const loggedInUser = localStorage.getItem('loggedInUser');
if(!loggedInUser) {
  modalMask.style.display = 'flex';
  loginModal.style.display = 'flex';
  registerModal.style.display = 'none';
  userInfo.style.display = 'none';
} else {
  usernameEl.textContent = loggedInUser;
  userInfo.style.display = 'flex';
}

// 登录按钮
document.getElementById('login-btn').addEventListener('click', () => {
  const email = document.getElementById('login-email').value;
  if(!email){ alert('Please enter email'); return; }
  localStorage.setItem('loggedInUser', email);
  modalMask.style.display = 'none';
  usernameEl.textContent = email;
  userInfo.style.display = 'flex';
});

// 注册按钮
document.getElementById('register-btn').addEventListener('click', () => {
  const email = document.getElementById('register-email').value;
  if(!email){ alert('Please enter email'); return; }
  localStorage.setItem('loggedInUser', email);
  modalMask.style.display = 'none';
  usernameEl.textContent = email;
  userInfo.style.display = 'flex';
});

// 切换到注册
document.getElementById('to-register').addEventListener('click', () => {
  loginModal.style.display = 'none';
  registerModal.style.display = 'flex';
});

// 切换到登录
document.getElementById('to-login').addEventListener('click', () => {
  registerModal.style.display = 'none';
  loginModal.style.display = 'flex';
});

