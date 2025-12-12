// ===== Panel Switch =====
const buttons = document.querySelectorAll('#toolbar .top-icons button');
const panels = document.querySelectorAll('#dynamic-panel .panel-section');

buttons.forEach((btn, index) => {
  btn.addEventListener('click', () => {
    // 如果是 Home 按钮（第一个按钮）
    if (btn.getAttribute('data-panel') === 'panel1') {
      panels.forEach(panel => panel.classList.remove('active'));
      return;
    }

    // 其他按钮：切换对应面板
    const targetPanelId = btn.getAttribute('data-panel');
    panels.forEach(panel => panel.classList.remove('active'));
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) targetPanel.classList.add('active');
  });
});
