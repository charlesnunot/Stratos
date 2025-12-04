document.addEventListener("DOMContentLoaded", () => {
  const loggedInUser = localStorage.getItem('loggedInUser');

  const overlay = document.getElementById('modal-overlay');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');

  const toRegister = document.getElementById('to-register');
  const toLogin = document.getElementById('to-login');

  const loginBtn = document.getElementById('login-btn');
  const registerBtn = document.getElementById('register-btn');

  // 如果未登录，显示模态
  if (!loggedInUser) {
    overlay.style.display = 'flex';
    loginModal.style.display = 'flex';
  }

  // 切换到注册
  toRegister.addEventListener('click', () => {
    loginModal.style.display = 'none';
    registerModal.style.display = 'flex';
  });

  // 切换到登录
  toLogin.addEventListener('click', () => {
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
  });

  // 登录
  loginBtn.addEventListener('click', () => {
    const email = document.getElementById('login-email').value;
    if (!email) { alert('Enter email'); return; }
    localStorage.setItem('loggedInUser', email);
    overlay.style.display = 'none';
  });

  // 注册
  registerBtn.addEventListener('click', () => {
    const email = document.getElementById('register-email').value;
    if (!email) { alert('Enter email'); return; }
    localStorage.setItem('loggedInUser', email);
    overlay.style.display = 'none';
  });
});
