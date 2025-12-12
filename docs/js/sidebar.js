export function initSidebar(container, userPanelContainer, contentContainer) {
  container.innerHTML = `
    <div class="icon" title="Home"><i class="fa-solid fa-house"></i></div>
    <div class="icon" title="Search"><i class="fa-solid fa-magnifying-glass"></i></div>
    <div class="icon" title="Explore"><i class="fa-solid fa-compass"></i></div>
    <div class="icon" title="Marketplace"><i class="fa-solid fa-store"></i></div>
    <div class="icon" title="Create"><i class="fa-solid fa-plus"></i></div>
    <div class="icon" title="Messages"><i class="fa-solid fa-envelope"></i></div>
    <div class="icon" id="chat-btn" title="Chat"><i class="fa-solid fa-comment-dots"></i></div>
    <div class="icon" title="Profile"><i class="fa-solid fa-user"></i></div>
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
