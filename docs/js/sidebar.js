// sidebar.js

// 显示和隐藏侧边栏的更多菜单
document.getElementById('more-button').addEventListener('click', () => {
  const moreButton = document.getElementById('more-button');
  moreButton.classList.toggle('active'); // 切换 active 类
});


// 退出登录按钮
document.getElementById('logout-btn').addEventListener('click', () => {
  // 清除 token 和用户名
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');

  // 重新显示登录和注册弹窗
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  const userInfo = document.getElementById('user-info');

  modalMask.style.display = 'flex';
  loginModal.style.display = 'flex';
  registerModal.style.display = 'none';
  userInfo.style.display = 'none';
});

