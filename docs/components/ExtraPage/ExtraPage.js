const baseURL = new URL('.', import.meta.url);

/**
 * 挂载 ExtraPage 到容器
 */
export async function mountExtraPage(container) {
  if (!container) return;

  // 1️⃣ 加载 HTML 模板
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
  // 注册/登录点击
  const registerText = document.getElementById('register-text');
  const loginText = document.getElementById('login-text');

  if (registerText) registerText.addEventListener('click', () => openRegisterModal());
  if (loginText) loginText.addEventListener('click', () => openLoginModal());

  // 点击条款/隐私/社区公约
  document.querySelectorAll('.policy-link').forEach(el => {
    el.addEventListener('click', () => {
      const policy = el.dataset.policy;
      alert(`显示弹窗: ${policy}`);
    });
  });
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

/**
 * 显示用户信息区（只在用户登录时调用）
 */
export function showUserInfo(user) {
  const extraContainer = document.getElementById('extra-page');
  if (!extraContainer || !user) return;

  // 创建用户信息区
  const userSection = document.createElement('section');
  userSection.id = 'user-info-section';
  userSection.className = 'extra-section';
  userSection.innerHTML = `
    <p class="welcome-text">Welcome back, ${user.email}</p>
    <button id="logout-btn">Log out</button>
  `;

  extraContainer.prepend(userSection); // 放在顶部

  // 绑定登出事件
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { signOut } = await import('../../store/supabase.js');
      await signOut();
    });
  }
}

/**
 * 隐藏用户信息区（用户登出时调用）
 */
export function hideUserInfo() {
  const userSection = document.getElementById('user-info-section');
  if (userSection) userSection.remove();
}
