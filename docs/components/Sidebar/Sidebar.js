// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';

// 模块作用域获取当前文件 URL
const baseURL = new URL('.', import.meta.url);

export async function mountSidebar(container) {
  if (!container) return;

  // 1️⃣ 加载 Sidebar HTML
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 2️⃣ 加载 Sidebar CSS
  loadCSS(new URL('Sidebar.css', baseURL));

  // 3️⃣ 挂载顶部 Logo
  const topEl = document.getElementById('sidebar-top');
  mountLogo(topEl);

  // 4️⃣ 初始化导航项
  mountNavItems();
}

// 初始化导航按钮
function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  // 可以在这里继续挂载其他导航项，例如：
  // mountNavItem('#nav-market', 'market');
  // mountNavItem('#nav-profile', 'profile');
}

// 挂载单个导航按钮
async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  switch (page) {
    case 'home': {
      // 动态加载模块（如果有页面特定内容）
      const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
      mountNavHome(target);

      // 给按钮绑定点击事件
      target.addEventListener('click', () => {
        navigateToPage(page);
      });

      break;
    }
    // 可继续添加其他导航按钮
  }
}

// 页面跳转及激活状态更新
function navigateToPage(page) {
  switch (page) {
    case 'home':
      // 如果是多页面，可直接跳转
      window.location.href = '/index.html';
      break;

    // 如果是 SPA，可使用前端路由
    // case 'market': router.navigate('/market'); break;

    default:
      console.warn('未知页面:', page);
  }

  // 更新导航激活状态
  updateActiveNav(page);
}

// 更新导航按钮的 active 样式
function updateActiveNav(activePage) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const page = item.dataset.page;
    if (page === activePage) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// CSS 加载函数（防重复）
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
