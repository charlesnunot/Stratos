export function initSidebar(container, userPanelContainer, contentContainer) {
  container.innerHTML = `
    <div class="icon" title="Home"><i class="fas fa-house"></i></div>
    <div class="icon" title="Search"><i class="fas fa-magnifying-glass"></i></div>
    <div class="icon" title="Explore"><i class="fas fa-compass"></i></div>
    <div class="icon" title="Marketplace"><i class="fas fa-store"></i></div>
    <div class="icon" title="Create"><i class="fas fa-plus"></i></div>
    <div class="icon" title="Messages"><i class="fas fa-envelope"></i></div>
    <div class="icon" id="chat-btn" title="Chat"><i class="fas fa-comment-dots"></i></div>
    <div class="icon" title="Profile"><i class="fas fa-user"></i></div>
  `;

  container.querySelectorAll('.icon').forEach(icon => {
    if (icon.id !== 'chat-btn') {
      icon.addEventListener('click', () => {
        alert(`Clicked ${icon.title}`);
      });
    }
  });

  const chatBtn = document.getElementById('chat-btn');
  chatBtn.addEventListener('click', () => {
    import('./chat-panel.js').then(module => {
      module.toggleChatPanel(userPanelContainer, contentContainer);
    });
  });

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '20px';
  container.style.paddingTop = '20px';
}
