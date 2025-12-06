import { getUser, clearUser } from './userManager.js'

export function initSidebar() {
  const moreButton = document.getElementById('more-button');
  const moreMenu = document.getElementById('more-menu');
  const sidebarLogout = document.getElementById('sidebar-logout-btn');

  if (moreButton && moreMenu) {
    moreButton.addEventListener('click', () => {
      moreButton.classList.toggle('active');
      moreMenu.style.display = moreMenu.style.display === 'block' ? 'none' : 'block';
    });
  }

  if (sidebarLogout) {
    sidebarLogout.addEventListener('click', () => {
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

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
