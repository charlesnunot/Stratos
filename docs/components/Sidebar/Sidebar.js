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

  // 监听 sidebar:navigate 事件
  window.addEventListener('sidebar:navigate', onSidebarNavigate);
}

// 挂载导航项
function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  mountNavItem('#nav-market', 'market');
  mountNavItem('#nav-publish', 'publish');
  mountNavItem('#nav-messages', 'messages');
  mountNavItem('#nav-profile', 'profile'); // 新增 Profile
}

// 挂载单个导航项
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
        const mainRoot = document.getElementById('main-root');
        if (!mainRoot) return;
        mainRoot.innerHTML = '';
        try {
          const { mountPublish } = await import(new URL('../Publish/Publish.js', baseURL));
          mountPublish(mainRoot);
        } catch (err) {
          console.error('加载 Publish 页面失败:', err);
        }
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
        const mainRoot = document.getElementById('main-root');
        if (!mainRoot) return;
        mainRoot.innerHTML = '';
        try {
          const { mountMessages } = await import(new URL('../Messages/Messages.js', baseURL));
          mountMessages(mainRoot);
        } catch (err) {
          console.error('加载 Messages 页面失败:', err);
        }
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
        const mainRoot = document.getElementById('main-root');
        if (!mainRoot) return;
        mainRoot.innerHTML = '';
        try {
          const { mountProfile } = await import(new URL('../Profile/Profile.js', baseURL));
          mountProfile(mainRoot);
        } catch (err) {
          console.error('加载 Profile 页面失败:', err);
        }
        updateActiveNav('profile');
      });
      break;
    }
    default:
      console.warn('未处理的导航项:', page);
  }
}

// 处理 sidebar:navigate 事件
function onSidebarNavigate(e) {
  const { page } = e.detail || {};
  if (!page) return;
  loadMainPage(page);
  updateActiveNav(page);
}

// 根据 page 加载 main-root 页面
async function loadMainPage(page) {
  const mainRoot = document.getElementById('main-root');
  if (!mainRoot) return;
  mainRoot.innerHTML = '';

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
      try {
        const { mountPublish } = await import(new URL('../Publish/Publish.js', baseURL));
        mountPublish(mainRoot);
      } catch (err) {
        console.error('加载 Publish 页面失败:', err);
      }
      break;
    }
    case 'messages': {
      try {
        const { mountMessages } = await import(new URL('../Messages/Messages.js', baseURL));
        mountMessages(mainRoot);
      } catch (err) {
        console.error('加载 Messages 页面失败:', err);
      }
      break;
    }
    case 'profile': {
      try {
        const { mountProfile } = await import(new URL('../Profile/Profile.js', baseURL));
        mountProfile(mainRoot);
      } catch (err) {
        console.error('加载 Profile 页面失败:', err);
      }
      break;
    }
    default:
      console.warn('未实现的页面:', page);
  }
}

// 更新导航 active 状态
function updateActiveNav(activePage) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const page = item.dataset.page;
    item.classList.toggle('active', page === activePage);
  });
}

// 加载 CSS
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
