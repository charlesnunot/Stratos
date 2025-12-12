// ===== Panel Switch =====
const buttons = document.querySelectorAll('#toolbar .top-icons button');
const panels = document.querySelectorAll('#dynamic-panel .panel-section');

buttons.forEach((btn, index) => {
  btn.addEventListener('click', () => {
    // 点击 Home 图标（index === 0）时，隐藏所有面板
    if (index === 0) {
      panels.forEach(panel => panel.classList.remove('active'));
      return;
    }

    // 点击其他图标，显示对应面板
    const targetPanelId = 'panel' + (index + 1); // panel1, panel2...
    panels.forEach(panel => panel.classList.remove('active'));
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) targetPanel.classList.add('active');
  });
});
