// docs/components/NavHome/NavHome.js
export async function mountNavHome(container) {
  // HTML
  const html = await fetch('./NavHome.html')  // 相对于 NavHome.js
    .then(res => res.text());
  container.innerHTML = html;

  // CSS
  loadCSS('./NavHome.css');  // 相对于 NavHome.js

  // 点击事件
  const btn = container.querySelector('.nav-item');
  if (btn) {
    btn.addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('sidebar:navigate', { detail: { page: 'home' } })
      );
    });
  }
}

function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
