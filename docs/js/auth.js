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
  localStorage.removeItem('username');
}

// 显示登录弹窗
function showLoginModal() {
  modalMask.style.display = 'flex';
  loginModal.style.display = 'flex';
  registerModal.style.display = 'none';
  userInfo.style.display = 'none';
}

// 显示用户信息
function showUser(email) {
  usernameEl.textContent = email || 'User';
  userInfo.style.display = 'flex';
  modalMask.style.display = 'none';
}

// 页面加载时检查登录状态
async function checkLogin() {
  const token = getToken();
  const username = localStorage.getItem('username');

  if (!token || !username) {
    // 没有 token 或用户名，显示登录
    showLoginModal();
    return;
  }

  // 可选：用 Supabase 校验 token 是否有效
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    clearToken();
    showLoginModal();
    return;
  }

  // 如果用户存在，但邮箱未验证
  if (!data.user.confirmed_at) {
    alert('Please verify your email before logging in.');
    clearToken();
    showLoginModal();
    return;
  }

  // 登录有效
  showUser(username);
}

// 调用检查登录
checkLogin();


// 登录按钮
document.getElementById('login-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    alert(error.message || 'Login failed');
    return;
  }

  // 登录成功但邮箱未验证
  if (!data.user.confirmed_at) {
    alert('Please verify your email before logging in.');
    return;
  }

  saveToken(data.session?.access_token);
  localStorage.setItem('username', email);
  showUser(email);
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

  // 注册成功，但邮箱未验证
  alert('Registration successful! We have sent a verification link to your email. Please verify before logging in.');

  // 切换到登录弹窗
  registerModal.style.display = 'none';
  loginModal.style.display = 'flex';
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


async function registerApi(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      let msg = '';
      const errMsg = error.message.toLowerCase();
      if (errMsg.includes('invalid email')) {
        msg = 'Invalid email format';
      } else if (errMsg.includes('already registered')) {
        msg = 'This email is already registered';
      } else if (errMsg.includes('password')) {
        msg = 'Password must be at least 6 characters';
      } else {
        msg = error.message || 'Registration failed, please try again';
      }
      return { success: false, message: msg };
    }

    if (!data.user) {
      return { success: false, message: 'Failed to get user info, please try again' };
    }

    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, message: err.message || 'Unknown error' };
  }
}
