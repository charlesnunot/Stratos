export function initSidebar(container, contentContainer) {
  container.innerHTML = `
    <div class="icon" data-panel="home" title="Home"><i class="fa-solid fa-house"></i></div>
    <div class="icon" data-panel="search" title="Search"><i class="fa-solid fa-magnifying-glass"></i></div>
    <div class="icon" data-panel="explore" title="Explore"><i class="fa-solid fa-compass"></i></div>
    <div class="icon" data-panel="chat" title="Chat"><i class="fa-solid fa-comment-dots"></i></div>
  `;

  container.querySelectorAll('.icon').forEach(icon => {
    icon.addEventListener('click', () => {
      const panelName = icon.dataset.panel;
      togglePanel(panelName, contentContainer);
    });
  });
}

let currentPanel = null;

function togglePanel(name, contentContainer) {
  let panel = document.getElementById(`panel-${name}`);
  
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = `panel-${name}`;
    panel.innerHTML = `<h3>${name.toUpperCase()}</h3><p>Content of ${name} panel</p>`;
    document.getElementById('main-container').appendChild(panel);
  }

  if (currentPanel && currentPanel !== panel) {
    currentPanel.classList.remove('show');
  }

  if (panel.classList.contains('show')) {
    panel.classList.remove('show');
    contentContainer.style.flex = '1';
    currentPanel = null;
  } else {
    panel.classList.add('show');
    contentContainer.style.flex = '1 1 calc(100% - 300px)'; // 压缩主内容
    currentPanel = panel;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sidebarContainer = document.getElementById('sidebar-container');
  const contentContainer = document.getElementById('content-container');
  initSidebar(sidebarContainer, contentContainer);
});
