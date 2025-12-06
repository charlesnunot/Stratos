import { getUser, clearUser,clearUser } from './userManager.js'

export function initRightPanel() {
  const userInfoEl = document.getElementById('user-info');
  const usernameEl = document.getElementById('username');
  const avatarEl = document.getElementById('user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const modalMask = document.getElementById('modal-mask');
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');

  const user = getUser();
  if (user && user.nickname) {
    if (usernameEl) usernameEl.textContent = user.nickname;
    if (avatarEl) avatarEl.src = user.avatarUrl || avatarEl.src;
    if (userInfoEl) userInfoEl.style.display = 'flex';
  } else if (userInfoEl) {
    userInfoEl.style.display = 'none';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearUser();
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');

      if (userInfoEl) userInfoEl.style.display = 'none';
      if (modalMask) modalMask.style.display = 'flex';
      if (loginModal) loginModal.style.display = 'flex';
      if (registerModal) registerModal.style.display = 'none';
    });
  }
}
