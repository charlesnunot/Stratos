async function mountNavItem(selector, page) {
  const target = document.querySelector(selector);
  if (!target) return;

  if (page === 'home') {
    const { mountNavHome } = await import('../NavHome/NavHome.js'); // 相对于 Sidebar.js
    mountNavHome(target);
  }
  // 其他 nav 可以继续类似逻辑
}
