import { initToolbar } from '../components/Toolbar/Toolbar.js';
import { initUserPanel } from '../components/UserPanel/UserPanel.js';
import { initDynamicPanel } from '../components/DynamicPanel/DynamicPanel.js';
import { initMainContent } from '../components/MainContent/MainContent.js';

// 先初始化 DynamicPanel，创建 panel 容器
initDynamicPanel.init();

// 然后初始化 UserPanel（panel-user 已存在 DOM）
initUserPanel();

// 初始化 MainContent
initMainContent();

// 初始化 Toolbar 并绑定点击事件
initToolbar(panelId => {
  initDynamicPanel.showPanel(panelId);
});
