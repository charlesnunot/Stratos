// docs/components/Sidebar/Sidebar.js

export async function mountSidebar(container) {
  // 1. 挂载 Sidebar HTML
  const html = await fetch('./Sidebar.html')
    .then(res => res.text());
  container.innerHTML = html;

  // 2. 挂载 CSS
  loadCSS('./Sidebar.css');

  // 3. 挂载导航项
  mountNavItems();
}

// 挂载所有导航项
function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  mountNavItem('#nav-market', 'market');
  mountNavItem('#nav-publish', 'publish');
  mountNavItem('#nav-messages', 'messages');
  mountNavItem('#nav-profile', 'profile');
  mountNavItem('#nav-more', 'more');
}

// 挂载单个导航项
async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    const { mountNavHome } = await import('../NavHome/NavHome.js');
    mountNavHome(target);
  }

  // 其他 nav 可以类似逻辑
}

// 加载 CSS 工具函数
function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
