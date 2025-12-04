document.addEventListener('DOMContentLoaded', () => {
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
    modalMask.style.display = 'flex';
    loginModal.style.display = 'flex';
    registerModal.style.display = 'none';
    userInfo.style.display = 'none';
  } else {
    const username = localStorage.getItem('username') || 'User';
    usernameEl.textContent = username;
    userInfo.style.display = 'flex';
  }

  // 登录按钮
  document.getElementById('login-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    // 使用 Supabase 登录
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert(error.message);
      return;
    }

    if (!data.user.email_confirmed_at) {
      alert('Your email is not verified. Please check your inbox.');
      return;
    }

    // 登录成功
    saveToken(data.session?.access_token || '');
    localStorage.setItem('username', email);
    usernameEl.textContent = email;
    userInfo.style.display = 'flex';
    modalMask.style.display = 'none';
    loginModal.style.display = 'none';
    registerModal.style.display = 'none';
  });

  // 注册按钮
  document.getElementById('register-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    const result = await registerApi(email, password);

    if (!result.success) {
      alert(result.message);
      return;
    }

    // 注册成功提示邮箱验证
    alert('Registration successful! We have sent a verification link to your email. Please verify before logging in.');

    // 切换到登录弹窗
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
  });

  // 切换弹窗
  document.getElementById('to-register')?.addEventListener('click', () => {
    loginModal.style.display = 'none';
    registerModal.style.display = 'flex';
  });

  document.getElementById('to-login')?.addEventListener('click', () => {
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
  });

  // 注册 API
  async function registerApi(email, password) {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        let msg = error.message || 'Registration failed';
        const errMsg = error.message.toLowerCase();
        if (errMsg.includes('invalid email')) msg = 'Invalid email format';
        else if (errMsg.includes('already registered')) msg = 'This email is already registered';
        else if (errMsg.includes('password')) msg = 'Password must be at least 6 characters';
        return { success: false, message: msg };
      }
      if (!data.user) return { success: false, message: 'Failed to get user info' };
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, message: err.message || 'Unknown error' };
    }
  }
});
