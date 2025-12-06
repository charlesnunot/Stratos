// js/main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';

async function loadSidebarAndRightPanel() {
  try {
    const sidebarResp = await fetch('sidebar.html');
    document.getElementById('sidebar-container').innerHTML = await sidebarResp.text();

    const rightResp = await fetch('right-panel.html');
    document.getElementById('right-panel-container').innerHTML = await rightResp.text();

    initSidebar();
    initRightPanel();
    await initAuth();
  } catch (err) {
    console.error('加载 Sidebar 或 Right Panel 出错:', err);
  }
}

window.addEventListener('DOMContentLoaded', loadSidebarAndRightPanel);

