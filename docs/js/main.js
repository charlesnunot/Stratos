// js/main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';
import { updateWebMonitor, clearWebMonitor } from './webMonitor.js';
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

    // 5️⃣ 注册标签页并同步登录状态
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

// 当最后一个标签页关闭时，清理 web_monitor
window.addEventListener('beforeunload', async () => {
  const user = getUser();
  if (!user) return;

  // 计算剩余标签页数量（当前标签页即将关闭，所以减1）
  const remainingTabs = getTabCount() - 1;
  if (remainingTabs <= 0) {
    // 最后一个标签页关闭，清理 web_monitor
    await clearWebMonitor();
  }
});
