const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel1') { // Home 按钮
      dynamicPanel.style.width = '0';
      dynamicPanel.style.padding = '0'; // 避免内容占位
      dynamicPanel.style.overflow = 'hidden';
    } else {
      // 恢复动态面板宽度
      dynamicPanel.style.width = '300px';
      dynamicPanel.style.padding = '20px';
      dynamicPanel.style.overflow = 'auto';

      // 显示对应面板内容
      const panels = dynamicPanel.querySelectorAll('.panel-section');
      panels.forEach(panel => panel.classList.remove('active'));
      const targetPanel = document.getElementById(panelId);
      if (targetPanel) targetPanel.classList.add('active');
    }
  });
});
