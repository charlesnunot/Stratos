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
      return;
    }

    // show dynamic panel
    dynamicPanel.classList.remove('hidden');
    panels.forEach(p => p.classList.remove('active'));

    const target = document.getElementById(panelId);
    if (target) target.classList.add('active');
  });
});
