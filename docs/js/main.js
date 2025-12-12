import { initSidebar } from './sidebar.js';
import { initUserPanel } from './user-panel.js';
import { initContent } from './content.js';

document.addEventListener('DOMContentLoaded', () => {
  initSidebar(document.getElementById('sidebar-container'));
  initUserPanel(document.getElementById('user-panel-container'));
  initContent(document.getElementById('content-container'));
});
