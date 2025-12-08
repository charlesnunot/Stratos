// js/main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';
import { updateWebMonitor } from './webMonitor.js';
import { getUser } from './userManager.js';
import { registerTab, getTabCount } from './webTabTracker.js';

async function loadApp() {
  try {
    // 1️⃣ 加载 HTML 组件
    const [sidebarResp, rightResp] = await Promise.all([
      fetch('components/sidebar.html'),
      fetch('components/right-panel.html')
    ]);
    registerTab();

    document.getElementById('sidebar-container').innerHTML = await sidebarResp.text();
    document.getElementById('right-panel-container').innerHTML = await rightResp.text();

    // 2️⃣ 初始化 Auth（确保用户状态已知）
    await initAuth();

    // 3️⃣ 初始化右侧面板（依赖用户状态）
    initRightPanel();

    // 4️⃣ 初始化侧边栏
    initSidebar();

    // 5️⃣ 首次记录 Web 用户行为
    const user = getUser();
    if (user) {
      updateWebMonitor({
        current_page: window.location.pathname || 'home',
        extra: { from: 'web_init' }
      });

      // 6️⃣ 启动心跳（每 15 秒更新 last_seen）
      startHeartbeat();
    }

  } catch (err) {
    console.error('加载 Sidebar 或 Right Panel 出错:', err);
  }
}


window.addEventListener('DOMContentLoaded', loadApp);
