// ===== 面板切换 =====
const buttons = document.querySelectorAll('#toolbar .top-icons button');
const panels = document.querySelectorAll('#dynamic-panel .panel-section');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetIndex = Array.from(buttons).indexOf(btn);
    const targetPanelId = 'panel' + (targetIndex + 1);

    panels.forEach(panel => panel.classList.remove('active'));
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) targetPanel.classList.add('active');
  });
});
