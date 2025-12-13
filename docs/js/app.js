// docs/js/app.js
import { mountSidebar } from '../components/Sidebar/Sidebar.js';

document.addEventListener('DOMContentLoaded', () => {
  const sidebarRoot = document.getElementById('sidebar-root');
  if (sidebarRoot) mountSidebar(sidebarRoot);
});
