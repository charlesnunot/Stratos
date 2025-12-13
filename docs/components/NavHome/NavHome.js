// docs/components/NavHome/NavHome.js

// 模块作用域获取当前文件 URL
const baseURL = new URL('.', import.meta.url);

export async function mountNavHome(container) {
  // 加载 HTML
  const html = await fetch(new URL('NavHome.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('NavHome.css', baseURL));

  // 给按钮绑定事件
  const btn = container.querySelector('.nav-item');
  if (btn) {
    btn.addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('sidebar:navigate', { detail: { page: 'home' } })
      );
    });
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
