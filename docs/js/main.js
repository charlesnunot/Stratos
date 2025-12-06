// js/main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';

async function loadSidebarAndRightPanel() {
  try {
    // 注意 fetch 路径是相对于 index.html 所在目录
    const sidebarResp = await fetch('components/sidebar.html');
    document.getElementById('sidebar-container').innerHTML = await sidebarResp.text();

    const rightResp = await fetch('components/right-panel.html');
    document.getElementById('right-panel-container').innerHTML = await rightResp.text();

    // 初始化模块
    initSidebar();
    initRightPanel();
    await initAuth();
  } catch (err) {
    console.error('加载 Sidebar 或 Right Panel 出错:', err);
  }
}

window.addEventListener('DOMContentLoaded', loadSidebarAndRightPanel);
