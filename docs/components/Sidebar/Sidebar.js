const baseURL = new URL('.', import.meta.url);
export async function mountSidebar(container) {
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // CSS 相对于 Sidebar.js 自身
  loadCSS(new URL('Sidebar.css', baseURL));

  mountNavItems();
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
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
