import { initSidebar } from './sidebar.js';
import { initUserPanel } from './user-panel.js';
import { initContent } from './content.js';
import { toggleChatPanel } from './chat-panel.js';

document.addEventListener('DOMContentLoaded', () => {
  const sidebarContainer = document.getElementById('sidebar-container');
  const userPanelContainer = document.getElementById('user-panel-container');
  const contentContainer = document.getElementById('content-container');

  initSidebar(sidebarContainer, userPanelContainer, contentContainer);
  initUserPanel(userPanelContainer);
  initContent(contentContainer);
});
