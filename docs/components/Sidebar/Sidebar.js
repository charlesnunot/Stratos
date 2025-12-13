// docs/components/Sidebar/Sidebar.js

// 模块作用域获取当前文件 URL
const baseURL = new URL('.', import.meta.url);

export async function mountSidebar(container) {
  // 加载 Sidebar.html
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 Sidebar.css
  loadCSS(new URL('Sidebar.css', baseURL));

  // 初始化导航项
  mountNavItems();
}

function mountNavItems() {
  mountNavItem('#nav-home', 'home');
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    // 加载 NavHome.js 模块
    const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL));
    // 调用 mountNavHome，并传入目标容器
    mountNavHome(target);
  }

  // 可以在这里添加更多 page 的处理逻辑
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
