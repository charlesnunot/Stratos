export function initSidebar(container, userPanelContainer, contentContainer) {
  container.innerHTML = `
    <button title="Home"><i class="fa-solid fa-house"></i></button>
    <button title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
    <button title="Explore"><i class="fa-solid fa-compass"></i></button>
    <button title="Marketplace"><i class="fa-solid fa-store"></i></button>
    <button title="Create"><i class="fa-solid fa-plus"></i></button>
    <button title="Messages"><i class="fa-solid fa-envelope"></i></button>
    <button id="chat-btn" title="Chat"><i class="fa-solid fa-comment-dots"></i></button>
    <button title="Profile"><i class="fa-solid fa-user"></i></button>
  `;

  container.querySelectorAll('button').forEach(btn => {
    if (btn.id !== 'chat-btn') {
      btn.addEventListener('click', () => {
        alert(`Clicked ${btn.title}`);
      });
    }
  });

  // 点击聊天按钮动态添加聊天面板
  const chatBtn = document.getElementById('chat-btn');
  chatBtn.addEventListener('click', () => {
    import('./chat-panel.js').then(module => {
      module.initChatPanel(userPanelContainer, contentContainer);
    });
  });

  // 样式
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.padding = '12px';
}
