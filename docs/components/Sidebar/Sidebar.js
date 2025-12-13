// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';

const baseURL = new URL('.', import.meta.url);

export async function mountSidebar(container) {
  if (!container) return;

  // 加载 Sidebar HTML
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Sidebar.css', baseURL));

  // 挂载 Logo
  const topEl = document.getElementById('sidebar-top');
  if (topEl) mountLogo(topEl);

  // 初始化导航
  mountNavItems();

  // 初始化底部功能（More / App）
  mountSidebarBottom();

  // 监听 sidebar:navigate 事件（保留）
  window.addEventListener('sidebar:navigate', onSidebarNavigate);
}

/* =========================
   主导航
========================= */

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  mountNavItem('#nav-market', 'market');
  mountNavItem('#nav-publish', 'publish');
  mountNavItem('#nav-messages', 'messages');
  mountNavItem('#nav-profile', 'profile');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  switch (page) {
    case 'home': {
      const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
      mountNavHome(target);
      target.addEventListener('click', () => loadMainPage('home'));
      break;
    }

    case 'market': {
      const { mountNavMarket } = await import(new URL('../NavMarket/NavMarket.js', baseURL));
      mountNavMarket(target);
      target.addEventListener('click', () => loadMainPage('market'));
      break;
    }

    case 'publish': {
      if (!target.innerHTML) {
        target.innerHTML = `
          <span class="material-symbols-outlined nav-icon">publish</span>
          <span class="nav-label">Publish</span>
        `;
      }

      target.addEventListener('click', async () => {
        await loadMainPage('publish');
        updateActiveNav('publish');
      });
      break;
    }

    case 'messages': {
      if (!target.innerHTML) {
        target.innerHTML = `
          <span class="material-symbols-outlined nav-icon">message</span>
          <span class="nav-label">Messages</span>
        `;
      }

      target.addEventListener('click', async () => {
        await loadMainPage('messages');
        updateActiveNav('messages');
      });
      break;
    }

    case 'profile': {
      if (!target.innerHTML) {
        target.innerHTML = `
          <span class="material-symbols-outlined nav-icon">person</span>
          <span class="nav-label">Profile</span>
        `;
      }

      target.addEventListener('click', async () => {
        await loadMainPage('profile');
        updateActiveNav('profile');
      });
      break;
    }

    default:
      console.warn('未处理的导航项:', page);
  }
}

/* =========================
   Sidebar 底部功能
========================= */

async function mountSidebarBottom() {
  const moreBtn = document.getElementById('nav-more');
  const appBtn = document.getElementById('nav-app-download');

  // More：弹出菜单
  if (moreBtn) {
    try {
      const { mountMore } = await import(new URL('../More/More.js', baseURL));
      mountMore(document.body, moreBtn);
    } catch (err) {
      console.error('加载 More 菜单失败:', err);
    }
  }

  // App Download：跳转下载页
  if (appBtn) {
    appBtn.addEventListener('click', async () => {
      const mainRoot = document.getElementById('main-root');
      if (!mainRoot) return;

      mainRoot.innerHTML = '';

      try {
        const { mountAppDownload } = await import(
          new URL('../AppDownload/AppDownload.js', baseURL)
        );
        mountAppDownload(mainRoot);
      } catch (err) {
        console.error('加载 App 下载页面失败:', err);
      }
    });
  }
}

/* =========================
   页面加载
========================= */

function onSidebarNavigate(e) {
  const { page } = e.detail || {};
  if (!page) return;
  loadMainPage(page);
  updateActiveNav(page);
}

async function loadMainPage(page) {
  const mainRoot = document.getElementById('main-root');
  if (!mainRoot) return;

  mainRoot.innerHTML = '';

  try {
    switch (page) {
      case 'home': {
        const { mountHome } = await import(new URL('../Home/Home.js', baseURL));
        mountHome(mainRoot);
        break;
      }

      case 'market': {
        const { mountMarket } = await import(new URL('../Market/Market.js', baseURL));
        mountMarket(mainRoot);
        break;
      }

      case 'publish': {
        const { mountPublish } = await import(new URL('../Publish/Publish.js', baseURL));
        mountPublish(mainRoot);
        break;
      }

      case 'messages': {
        const { mountMessages } = await import(new URL('../Messages/Messages.js', baseURL));
        mountMessages(mainRoot);
        break;
      }

      case 'profile': {
        const { mountProfile } = await import(new URL('../Profile/Profile.js', baseURL));
        mountProfile(mainRoot);
        break;
      }

      default:
        console.warn('未实现的页面:', page);
    }
  } catch (err) {
    console.error(`加载 ${page} 页面失败:`, err);
  }
}

/* =========================
   工具函数
========================= */

function updateActiveNav(activePage) {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
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

