function initSidebar() {
  const moreButton = document.getElementById('more-button');
  const moreMenu = document.getElementById('more-menu');
  const sidebarLogout = document.getElementById('sidebar-logout-btn'); // 修改了 HTML 中 logout ID

  if (moreButton && moreMenu) {
    moreButton.addEventListener('click', () => {
      moreButton.classList.toggle('active');
      // 可选：直接切换显示状态
      if (moreMenu.style.display === 'block') {
        moreMenu.style.display = 'none';
      } else {
        moreMenu.style.display = 'block';
      }
    });
  }

  if (sidebarLogout) {
    sidebarLogout.addEventListener('click', () => {
      // 清除 token 和用户名
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      // 显示登录弹窗
      const modalMask = document.getElementById('modal-mask');
      const loginModal = document.getElementById('login-modal');
      const registerModal = document.getElementById('register-modal');
      const userInfo = document.getElementById('user-info');

      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';
      if (userInfo) userInfo.style.display = 'none';
    });
  }
}

// 动态加载 sidebar 后调用
document.addEventListener('DOMContentLoaded', () => {
  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) {
    // 等 sidebar 加载完毕后初始化
    initSidebar();
  }
});
