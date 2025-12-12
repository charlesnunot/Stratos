import { initToolbar } from '../components/Toolbar/Toolbar.js';
import { initUserPanel, setAppOnline, setAppOffline } from '../components/UserPanel/UserPanel.js';
import { initDynamicPanel } from '../components/DynamicPanel/DynamicPanel.js';
import { initMainContent } from '../components/MainContent/MainContent.js';

// 初始化 Toolbar 并绑定面板切换
initToolbar(panelId => {
  initDynamicPanel.showPanel(panelId);
});

// 初始化其他大组件
initUserPanel();
initMainContent();
