// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';

// 模块作用域基准路径
const baseURL = new URL('.', import.meta.url);

/**
 * Sidebar 入口
 */
export async function mountSidebar(container) {
  if (!container) return;

  // 加载 Sidebar 结构
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载样式
  loadCSS(new URL('Sidebar.css', baseURL));

  // 挂载 Logo
  const topEl = document.getElementById('sidebar-top');
  if (topEl) {
    mountLogo(topEl);
  }

  // 初始化导航按钮
  mountNavItems();

  // 监听导航事件（唯一入口）
  window.addEventListener('sidebar:navigate', onSidebarNavigate);
}

/* =========================
   Navigation
========================= */

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  mountNavItem('#nav-market', 'market');
  // 后续可继续：
  // mountNavItem('#nav-publish', 'publish');
  // mountNavItem('#nav-messages', 'messages');
  // mountNavItem('#nav-profile', 'profile');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  switch (page) {
    case 'home': {
      const { mountNavHome } = await import(
        new URL('../NavHome/NavHome.js', baseURL)
      );
      mountNavHome(target);
      break;
    }

    case 'market': {
      const { mountNavMarket } = await import(
        new URL('../NavMarket/NavMarket.js', baseURL)
      );
      mountNavMarket(target);
      break;
    }

    default:
      console.warn('未处理的导航项:', page);
  }
}

/* =========================
   Navigation Event Handler
========================= */

function onSidebarNavigate(e) {
  const { page } = e.detail || {};
  if (!page) return;

  loadMainPage(page);
  updateActiveNav(page);
}

/* =========================
   Main Page Loader
========================= */

async function loadMainPage(page) {
  const mainRoot = document.getElementById('main-root');
  if (!mainRoot) return;

  mainRoot.innerHTML = '';

  switch (page) {
    case 'home': {
      const { mountHome } = await import(
        new URL('../Home/Home.js', baseURL)
      );
      mountHome(mainRoot);
      break;
    }

    case 'market': {
      const { mountMarket } = await import(
        new URL('../Market/Market.js', baseURL)
      );
      mountMarket(mainRoot);
      break;
    }

    default:
      console.warn('未实现的页面:', page);
  }
}

/* =========================
   UI State
========================= */

function updateActiveNav(activePage) {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    const page = item.dataset.page;
    item.classList.toggle('active', page === activePage);
  });
}

/* =========================
   Utils
========================= */

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
