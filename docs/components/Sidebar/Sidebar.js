// docs/components/Sidebar/Sidebar.js

export async function mountSidebar(container) {
  // 1. 挂载 Sidebar HTML
  const html = await fetch('./Sidebar.html')  // 相对于 Sidebar.js
    .then(res => res.text());
  container.innerHTML = html;

  // 2. 挂载 CSS
  loadCSS('./Sidebar.css'); // 相对于 Sidebar.js

  // 3. 挂载导航项
  mountNavItems();
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  // 后续可以挂载其他 nav
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    const { mountNavHome } = await import('../NavHome/NavHome.js'); // 相对于 Sidebar.js
    mountNavHome(target);
  }
}

function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
