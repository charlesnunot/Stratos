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
document.getElementById('register-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  // 显示 loading（可选）
  const result = await registerApi(email, password);

  if (!result.success) {
    alert(result.message);
    return;
  }

  // 成功注册
  alert('Registration successful! You are now logged in.');
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

    // 保存 token
    saveToken(data.session?.access_token || '');
    localStorage.setItem('username', email);

    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, message: err.message || 'Unknown error' };
  }
}



