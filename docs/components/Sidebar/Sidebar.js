// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';

// 当前模块 URL
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

// 挂载导航按钮
function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  // 可以继续挂载其他导航按钮，例如：
  // mountNavItem('#nav-market', 'market');
  // mountNavItem('#nav-profile', 'profile');
}

// 挂载单个导航按钮
async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  switch (page) {
    case 'home': {
      const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
      mountNavHome(target);

      // 点击按钮时加载内容到 main-root
      target.addEventListener('click', () => {
        loadMainPage(page);
        updateActiveNav(page);
      });

      // 页面初始默认显示 Home
      loadMainPage(page);
      updateActiveNav(page);
      break;
    }
    // 可继续添加其他导航按钮
  }
}

// 加载 main-root 内容
async function loadMainPage(page) {
  const mainRoot = document.getElementById('main-root');
  if (!mainRoot) return;

  mainRoot.innerHTML = ''; // 清空现有内容

  switch (page) {
    case 'home': {
      const { mountHome } = await import(new URL('../Home/Home.js', baseURL));
      mountHome(mainRoot);
      break;
    }
    // case 'market': ...
  }
}

// 更新导航按钮激活状态
function updateActiveNav(activePage) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const page = item.dataset.page;
    item.classList.toggle('active', page === activePage);
  });
}

// CSS 加载函数
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
