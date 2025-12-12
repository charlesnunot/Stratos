// ===== 面板切换和滑入/滑出动画 =====
const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel1') { // Home 按钮 → 隐藏面板
      dynamicPanel.classList.add('hidden');

      // 隐藏所有中间面板内容
      dynamicPanel.querySelectorAll('.panel-section').forEach(panel => panel.classList.remove('active'));
    } else {
      // 显示面板
      dynamicPanel.classList.remove('hidden');

      // 显示对应面板内容
      dynamicPanel.querySelectorAll('.panel-section').forEach(panel => panel.classList.remove('active'));
      const targetPanel = document.getElementById(panelId);
      if (targetPanel) targetPanel.classList.add('active');
    }
  });
});
