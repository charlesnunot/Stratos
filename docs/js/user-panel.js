export function initUserPanel(container) {
  container.innerHTML = `
    <div class="user-panel">
      <h3>User Panel</h3>
      <p>Basic user info here...</p>
    </div>
  `;

  container.style.flex = '0 0 20%';  // 默认宽度 20%
  container.style.padding = '12px';
}
