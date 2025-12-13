// docs/components/NavHome/NavHome.js

export async function mountNavHome(container) {
  const html = await fetch('/docs/components/NavHome/NavHome.html')
    .then(res => res.text());
  container.innerHTML = html;

  loadCSS('/docs/components/NavHome/NavHome.css');

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
