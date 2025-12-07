// js/main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';
import { updateWebMonitor } from './webMonitor.js';

async function loadSidebarAndRightPanel() {
  try {
    // 加载 components
    const sidebarResp = await fetch('components/sidebar.html');
    document.getElementById('sidebar-container').innerHTML = await sidebarResp.text();

    const rightResp = await fetch('components/right-panel.html');
    document.getElementById('right-panel-container').innerHTML = await rightResp.text();

    // 初始化 UI 模块
    initSidebar();
    initRightPanel();

    // 初始化 Auth
    await initAuth();

    // ---- ① 首次记录用户行为 ----
    updateWebMonitor({
      current_page: window.location.pathname || 'home',
      extra: { from: 'web_init' }
    });

    // ---- ② 启动心跳（每15秒更新一次 last_seen）----
    startHeartbeat();

  } catch (err) {
    console.error('加载 Sidebar 或 Right Panel 出错:', err);
  }
}

function startHeartbeat() {
  setInterval(() => {
    updateWebMonitor({
      current_page: window.location.pathname || 'home',
      extra: { heartbeat: true }
    });
  }, 15000); // 每 15 秒
}

window.addEventListener('DOMContentLoaded', loadSidebarAndRightPanel);
