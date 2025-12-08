// js/main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';
import { updateWebMonitor, setWebStatus } from './webMonitor.js';
import { getUser } from './userManager.js';
import { registerTab, getTabCount } from './webTabTracker.js';

async function loadApp() {
  try {
    // 1️⃣ 加载 HTML 组件
    const [sidebarResp, rightResp] = await Promise.all([
      fetch('components/sidebar.html'),
      fetch('components/right-panel.html')
    ]);

    document.getElementById('sidebar-container').innerHTML = await sidebarResp.text();
    document.getElementById('right-panel-container').innerHTML = await rightResp.text();

    // 2️⃣ 初始化 Auth（确保用户状态已知）
    await initAuth();

    // 3️⃣ 初始化右侧面板（依赖用户状态）
    initRightPanel();

    // 4️⃣ 初始化侧边栏
    initSidebar();

    // 5️⃣ 注册标签页
    registerTab();

    const user = getUser();
    if (user && getTabCount() > 0) {
      // 用户已登录且至少有一个标签页，更新 web_monitor 为在线
      updateWebMonitor({
        current_page: window.location.pathname || 'home',
        status: 'online',
        extra: { from: 'web_init' }
      });
    }
  } catch (err) {
    console.error('加载 Sidebar 或 Right Panel 出错:', err);
  }
}

// 页面 DOM 加载完成后执行
window.addEventListener('DOMContentLoaded', loadApp);

// 当最后一个标签页关闭时，更新 status 为 offline
window.addEventListener('beforeunload', () => {
  const user = getUser();
  if (!user) return;

  const remainingTabs = getTabCount() - 1; // 当前标签页即将关闭
  if (remainingTabs <= 0) {
    // 最后一个标签页关闭，更新状态为 offline
    setWebStatus('offline');
  }
});


