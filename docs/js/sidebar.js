// js/sidebar.js
export function initSidebar(container) {
  container.innerHTML = `
    <button title="Home"><i class="fa-solid fa-house"></i></button>
    <button title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
    <button title="Explore"><i class="fa-solid fa-compass"></i></button>
    <button title="Marketplace"><i class="fa-solid fa-store"></i></button>
    <button title="Create"><i class="fa-solid fa-plus"></i></button>
    <button title="Messages"><i class="fa-solid fa-envelope"></i></button>
    <button title="Chat"><i class="fa-solid fa-comment-dots"></i></button>
    <button title="Profile"><i class="fa-solid fa-user"></i></button>
  `;

  // 添加点击事件示例
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      alert(`Clicked ${btn.title}`);
    });
  });

  // 样式优化（可选）
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.padding = '12px';
}
