const sidebarContainer = document.getElementById('sidebar-container');
const contentContainer = document.getElementById('content-container');

const icons = [
  { title: 'Home', icon: 'fa-house', panel: null },
  { title: 'Search', icon: 'fa-magnifying-glass', panel: 'Search Panel' },
  { title: 'Explore', icon: 'fa-compass', panel: 'Explore Panel' },
  { title: 'Marketplace', icon: 'fa-store', panel: 'Marketplace Panel' },
  { title: 'Create', icon: 'fa-plus', panel: 'Create Panel' },
  { title: 'Messages', icon: 'fa-envelope', panel: 'Messages Panel' },
  { title: 'Chat', icon: 'fa-comment-dots', panel: 'Chat Panel' },
  { title: 'Profile', icon: 'fa-user', panel: 'Profile Panel' },
];

// 当前显示的面板
let currentPanel = null;

// 初始化图标栏
icons.forEach(item => {
  const div = document.createElement('div');
  div.className = 'icon';
  div.title = item.title;
  div.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
  sidebarContainer.appendChild(div);

  div.addEventListener('click', () => {
    if (!item.panel) {
      alert(`Clicked ${item.title}`);
      return;
    }

    // 如果当前面板就是这个，收回
    if (currentPanel && currentPanel.dataset.title === item.title) {
      currentPanel.classList.remove('show');
      currentPanel = null;
      contentContainer.style.flex = '1';
      return;
    }

    // 移除已有面板
    if (currentPanel) {
      currentPanel.classList.remove('show');
    }

    // 创建或显示新面板
    let panel = document.querySelector(`.panel[data-title="${item.title}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'panel show';
      panel.dataset.title = item.title;
      panel.innerHTML = `<h3>${item.panel}</h3><p>Content for ${item.title}</p>`;
      contentContainer.parentNode.insertBefore(panel, contentContainer);
    } else {
      panel.classList.add('show');
    }

    currentPanel = panel;
    contentContainer.style.flex = `1 1 calc(100% - ${panel.offsetWidth}px)`;
  });
});
