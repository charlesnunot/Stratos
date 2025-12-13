export async function mountSidebar(container) {
  // const html = await fetch('components/Sidebar/Sidebar.html').then(res => res.text());
  const html = await fetch('./Sidebar.html').then(res => res.text());
  container.innerHTML = html;

  // CSS 相对于 Sidebar.js 自身
  loadCSS('./Sidebar.css');

  mountNavItems();
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    const { mountNavHome } = await import('../NavHome/NavHome.js');
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
