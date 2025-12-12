import { initToolbar } from '../components/Toolbar/Toolbar.js';
import { initUserPanel } from '../components/UserPanel/UserPanel.js';
import { initDynamicPanel } from '../components/DynamicPanel/DynamicPanel.js';
import { initMainContent } from '../components/MainContent/MainContent.js';

// 1️⃣ 初始化 DynamicPanel，创建 panel 容器
initDynamicPanel.init();

// 2️⃣ 初始化 UserPanel（panel-user 已经在 DOM 里）
initUserPanel();

// 3️⃣ 初始化主内容
initMainContent();

// 4️⃣ 初始化 Toolbar 并绑定面板切换
initToolbar(panelId => {
  initDynamicPanel.showPanel(panelId);
});
