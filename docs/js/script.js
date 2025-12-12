const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    // 折叠面板
    if (panelId === 'panel-user') {
      dynamicPanel.classList.add('hidden');
      dynamicPanel.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
      return;
    }

    // 展开面板
    dynamicPanel.classList.remove('hidden');
    dynamicPanel.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));

    const targetPanel = document.getElementById(panelId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
  });
});
