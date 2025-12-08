// main.js
import { initSidebar } from './sidebar.js';
import { initRightPanel } from './rightPanel.js';
import { initAuth } from './auth.js';
import { updateWebMonitor } from './webMonitor.js';
import { getUser } from './userManager.js';
import { registerTab, getTabCount } from './webTabTracker.js';

/**
 * 初始化应用
 */
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

    // 6️⃣ 用户已登录且至少有一个标签页，更新 web_monitor 为在线
    const user = getUser();
    if (user && getTabCount() > 0) {
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

/**
 * 最后一个标签页关闭时，更新状态为 offline
 * ⚠️ 注意：beforeunload 是同步事件，异步请求可能不会完成
 */
window.addEventListener('beforeunload', () => {
  const user = getUser();
  if (!user) return;

  const remainingTabs = getTabCount() - 1;
  if (remainingTabs <= 0) {
    const payload = {
      uid: user.id,
      status: 'offline',
      current_page: window.location.pathname || 'home',
      extra: { from: 'beforeunload' },
      device: 'web'
    };

    // 这里直接调用 Supabase REST API 的 endpoint 或你的服务器接口
    // sendBeacon 发送 JSON
    const url = 'https://YOUR_SUPABASE_PROJECT_URL/rest/v1/web_monitor';
    const headers = {
      'apikey': 'YOUR_SUPABASE_ANON_KEY',
      'Authorization': `Bearer ${user.access_token}`, // 如果需要认证
      'Content-Type': 'application/json'
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
  }
});

