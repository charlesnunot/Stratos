// docs/components/Sidebar/Sidebar.js

export async function mountSidebar(container) {
  // 用 GitHub Pages 上的相对网站根路径
  const html = await fetch('/docs/components/Sidebar/Sidebar.html')
    .then(res => res.text());
  container.innerHTML = html;

  loadCSS('/docs/components/Sidebar/Sidebar.css');

  mountNavItems();
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    const { mountNavHome } = await import('/docs/components/NavHome/NavHome.js');
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
