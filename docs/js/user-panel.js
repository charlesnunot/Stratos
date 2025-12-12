// js/user-panel.js

export function initUserPanel(container) {
  // 初始化用户面板内容
  container.innerHTML = `
    <div class="user-panel">
      <h3>User Panel</h3>
      <div class="user-card">
        <img src="https://via.placeholder.com/40" alt="User Avatar">
        <div class="username">User A</div>
      </div>
      <div class="user-card">
        <img src="https://via.placeholder.com/40" alt="User Avatar">
        <div class="username">User B</div>
      </div>
      <div class="user-card">
        <img src="https://via.placeholder.com/40" alt="User Avatar">
        <div class="username">User C</div>
      </div>
    </div>
  `;

  // 宽度与 padding 设置
  container.style.flex = '0 0 300px';  // 固定宽度 300px
  container.style.padding = '12px';
}
