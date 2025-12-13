// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js';
const baseURL = new URL('.', import.meta.url);

export async function mountSidebar(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Sidebar.css', baseURL));

  // 挂载 Logo
  const topEl = document.getElementById('sidebar-top');
  if (topEl) mountLogo(topEl);

  // 初始化导航
  mountNavItems();

  // 监听导航事件
  window.addEventListener('sidebar:navigate', onSidebarNavigate);
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
  mountNavItem('#nav-market', 'market');
  mountNavItem('#nav-publish', 'publish'); // Publish 图标点击处理
}

// 挂载单个导航项
async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  switch (page) {
    case 'home': {
      const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
      mountNavHome(target);
      break;
    }
    case 'market': {
      const { mountNavMarket } = await import(new URL('../NavMarket/NavMarket.js', baseURL));
      mountNavMarket(target);
      break;
    }
    case 'publish': {
      // 点击 Publish 图标时加载 Publish.html 到 main-root
      target.addEventListener('click', async () => {
        const mainRoot = document.getElementById('main-root');
        if (!mainRoot) return;

        // 清空 main-root
        mainRoot.innerHTML = '';

        // 加载 HTML
        const html = await fetch(new URL('../Publish/Publish.html', baseURL)).then(res => res.text());
        mainRoot.innerHTML = html;

        // 加载 CSS
        loadCSS(new URL('../Publish/Publish.css', baseURL));

        // 获取 DOM 元素
        const textarea = mainRoot.querySelector('#publish-content');
        const submitBtn = mainRoot.querySelector('#publish-submit');
        const feedback = mainRoot.querySelector('#publish-feedback');

        // 绑定按钮逻辑
        submitBtn.addEventListener('click', () => {
          const content = textarea.value.trim();
          if (!content) {
            feedback.textContent = 'Content cannot be empty.';
            feedback.style.color = 'red';
            return;
          }
          feedback.textContent = 'Post published!';
          feedback.style.color = 'green';
          textarea.value = '';
        });

        updateActiveNav('publish'); // 更新 Sidebar active 状态
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

// 加载 main-root 页面
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
      // Publish 页面由点击图标处理，不在这里导入 JS
      break;
    }
    default:
      console.warn('未实现的页面:', page);
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

// 加载 CSS
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
