const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {

    const panelId = btn.getAttribute('data-panel');

    // Home → 折叠动态面板
    if (panelId === 'panel-user') {
      dynamicPanel.classList.add('hidden');

      dynamicPanel.querySelectorAll('.panel-section')
        .forEach(p => p.classList.remove('active'));

      return;
    }

    // 其它按钮 → 展开
    dynamicPanel.classList.remove('hidden');

    dynamicPanel.querySelectorAll('.panel-section')
      .forEach(p => p.classList.remove('active'));

    const target = document.getElementById(panelId);
    if (target) target.classList.add('active');
  });
});
