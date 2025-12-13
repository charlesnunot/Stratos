export async function mountSidebar(container) {
  // 1. 挂载壳
  const html = await fetch('./components/Sidebar/Sidebar.html')
    .then(res => res.text());

  container.innerHTML = html;

  loadCSS('./components/Sidebar/Sidebar.css');

  // 2. 挂载导航项
  mountNavItems(container);
}

function mountNavItems(container) {
  mountNavItem('#nav-home',    'home');
  mountNavItem('#nav-market',  'market');
  mountNavItem('#nav-publish', 'publish');
  mountNavItem('#nav-messages','messages');
  mountNavItem('#nav-profile', 'profile');
  mountNavItem('#nav-more',    'more');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  const { mountNavItem } = await import('../NavItem/NavItem.js');
  mountNavItem(target, page);
}

function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

