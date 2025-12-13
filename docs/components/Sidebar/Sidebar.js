// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';
const baseURL = new URL('.', import.meta.url);

export async function mountSidebar(container) {
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  loadCSS(new URL('Sidebar.css', baseURL));

  // 挂载 Logo
  const topEl = document.getElementById('sidebar-top');
  mountLogo(topEl);

  // 初始化导航
  mountNavItems();

  // 监听自定义事件 sidebar:navigate
  window.addEventListener('sidebar:navigate', (e) => {
    const { page } = e.detail;
    loadMainPage(page);
    updateActiveNav(page);
  });
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

// 加载 main-root 内容
async function loadMainPage(page) {
  const mainRoot = document.getElementById('main-root');
  if (!mainRoot) return;

  mainRoot.innerHTML = ''; // 清空内容

  switch (page) {
    case 'home': {
      const { mountHome } = await import(new URL('../Home/Home.js', baseURL));
      mountHome(mainRoot);
      break;
    }
    // case 'market': ...
  }
}

// 更新导航按钮 active 状态
function updateActiveNav(activePage) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const page = item.dataset.page;
    item.classList.toggle('active', page === activePage);
  });
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
