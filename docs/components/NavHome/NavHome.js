// docs/components/NavHome/NavHome.js

export function mountNavHome(container) {
  if (!container) return;

  // 只绑定点击事件，不改 HTML
  container.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sidebar:navigate', { detail: { page: 'home' } }));
  });
}
