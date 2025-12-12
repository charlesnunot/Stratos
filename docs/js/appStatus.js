import { setAppOnline, setAppOffline } from "./appStatus.js";

const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');
const panels = dynamicPanel.querySelectorAll('.panel-section');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel-user') {
      // home → fold dynamic panel
      dynamicPanel.classList.add('hidden');
      panels.forEach(p => p.classList.remove('active'));

      // 🔴 用户点击 Home 时表示折叠 → APP 离线
      setAppOffline();

      return;
    }

    // show dynamic panel
    dynamicPanel.classList.remove('hidden');
    panels.forEach(p => p.classList.remove('active'));

    const target = document.getElementById(panelId);
    if (target) target.classList.add('active');

    // 🟢 只要展开动态面板 → APP 在线
    setAppOnline();
  });
});
