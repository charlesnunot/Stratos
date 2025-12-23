import { AuthModal } from '../AuthModal/AuthModal.js';

const baseURL = new URL('.', import.meta.url);

/**
 * 挂载 ExtraPage 到容器
 */
export async function mountExtraPage(container) {
  if (!container) return;

  // 1️⃣ 加载 HTML
  const html = await fetch(new URL('ExtraPage.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 2️⃣ 加载 CSS
  loadCSS(new URL('ExtraPage.css', baseURL));

  // 3️⃣ 初始化事件绑定
  initExtraPageEvents();
}

/**
 * 初始化事件绑定
 */
function initExtraPageEvents() {
  // 注册/登录点击，打开 AuthModal
  const registerText = document.getElementById('register-text');
  const loginText = document.getElementById('login-text');

  if (registerText) registerText.addEventListener('click', () => AuthModal.open('register'));
  if (loginText) loginText.addEventListener('click', () => AuthModal.open('login'));

  // 点击条款/隐私/社区公约
  document.querySelectorAll('.policy-link').forEach(el => {
    el.addEventListener('click', () => {
      const policy = el.dataset.policy;
      alert(`显示弹窗: ${policy}`);
    });
  });

  // 登出按钮
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { signOut } = await import('../../store/supabase.js');
      await signOut();
    });
  }
}

/**
 * 显示用户信息和基础数据区
 */
export function showUserInfo(user) {
  const userInfo = document.querySelector('#extra-page .user-info');
  const guestExtra = document.querySelector('#extra-page .guest-extra');
  const userDataSection = document.getElementById('user-data-section');

  if (!user || !userInfo || !guestExtra || !userDataSection) return;

  guestExtra.style.display = 'none';
  userInfo.style.display = 'block';
  userDataSection.style.display = 'block';

  // 邮箱
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email;
  // ✅ 头像（核心）
  const avatarImg = userDataSection.querySelector('img.avatar');
  if (avatarImg && user.avatar_url) {
    avatarImg.src = user.avatar_url;
  }
}

/**
 * 隐藏用户信息和基础数据区
 */
export function hideUserInfo() {
  const userInfo = document.querySelector('#extra-page .user-info');
  const guestExtra = document.querySelector('#extra-page .guest-extra');
  const userDataSection = document.getElementById('user-data-section');

  if (!userInfo || !guestExtra || !userDataSection) return;

  guestExtra.style.display = 'flex';
  userInfo.style.display = 'none';
  userDataSection.style.display = 'none';
}

/**
 * 动态加载 CSS
 */
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
