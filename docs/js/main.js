import { subscribeWebConfirm } from './webConfirmService.js';
import { initAuth, getUser, updateWebMonitor } from './auth.js';
import { initRightPanel } from './rightPanel.js';
import { initSidebar } from './sidebar.js';

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

    // 5️⃣ 用户已登录，更新 web_monitor 为在线
    const user = getUser();
    if (user) {
      updateWebMonitor({
        current_page: window.location.pathname || 'home',
        status: 'online',
        extra: { from: 'web_init' }
      });

      // 6️⃣ 订阅 web_confirm 表，自动响应 pending
      subscribeWebConfirm(user.uid);
    }

  } catch (err) {
    console.error('加载 Sidebar 或 Right Panel 出错:', err);
  }
}

loadApp();
