const baseURL = new URL('.', import.meta.url);

export async function mountMore(container, triggerEl) {
  if (!container || !triggerEl) return;

  // 加载 HTML
  const html = await fetch(new URL('More.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('More.css', baseURL));

  const menu = container.querySelector('#more-menu');
  const settings = container.querySelector('#more-settings');
  const report = container.querySelector('#more-report');
  const logout = container.querySelector('#more-logout');

  // 点击 More 图标切换显示
  triggerEl.addEventListener('click', () => {
    menu.classList.toggle('show');
  });

  settings.addEventListener('click', () => alert('Open Settings'));
  report.addEventListener('click', () => alert('Open Report'));
  logout.addEventListener('click', () => alert('Logout'));
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

