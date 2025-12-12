import { setAppOnline, setAppOffline } from "./appStatus.js";

const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');
const panels = dynamicPanel.querySelectorAll('.panel-section');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel-user') {
      // 点击 Home → 折叠动态面板
      dynamicPanel.classList.add('hidden');
      panels.forEach(p => p.classList.remove('active'));

      setAppOffline(); // 红点
      return;
    }

    // 展开动态面板
    dynamicPanel.classList.remove('hidden');
    panels.forEach(p => p.classList.remove('active'));

    const target = document.getElementById(panelId);
    if (target) target.classList.add('active');

    setAppOnline(); // 绿点
    
  });
});

// 弹窗显示完整 Bio
const bioElement = document.getElementById('user-bio');
bioElement.addEventListener('click', () => {
  const fullBio = bioElement.textContent; // 真实文本也可以放在 data-full 属性中
  alert(fullBio); // 临时弹窗显示全部
});
