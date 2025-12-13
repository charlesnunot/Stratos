// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';

// 模块作用域获取当前文件 URL
const baseURL = new URL('.', import.meta.url);

export async function mountSidebar(container) {
  if (!container) return;

  // 加载 Sidebar.html
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 Sidebar.css
  loadCSS(new URL('Sidebar.css', baseURL));

  // 挂载顶部 Logo
  const topEl = document.getElementById('sidebar-top');
  mountLogo(topEl);

  // 初始化导航项
  mountNavItems();
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  // 可在这里添加其他导航项挂载，例如：
  // mountNavItem('#nav-market', 'market');
  // mountNavItem('#nav-publish', 'publish');
  // mountNavItem('#nav-messages', 'messages');
  // mountNavItem('#nav-profile', 'profile');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  switch (page) {
    case 'home': {
      // 动态导入 NavHome 模块
      const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
      mountNavHome(target);
      break;
    }
    // 可以在这里添加更多 page 的处理逻辑
    // case 'market': ...
  }
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
