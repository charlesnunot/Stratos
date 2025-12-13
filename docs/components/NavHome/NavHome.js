export async function mountNavHome(container) {
  const htmlUrl = new URL('./NavHome.html', import.meta.url);
  const cssUrl  = new URL('./NavHome.css', import.meta.url);

  const html = await fetch(htmlUrl).then(res => res.text());
  container.innerHTML = html;
  loadCSS(cssUrl.href);

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
