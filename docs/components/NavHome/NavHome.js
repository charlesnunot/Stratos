// docs/components/NavHome/NavHome.js
export function mountNavHome(container) {
  if (!container) return;

  container.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sidebar:navigate', { detail: { page: 'home' } }));
  });
}
