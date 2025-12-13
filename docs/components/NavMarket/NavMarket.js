// docs/components/NavMarket/NavMarket.js
export function mountNavMarket(container) {
  if (!container) return;

  container.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sidebar:navigate', { detail: { page: 'market' } }));
  });
}
