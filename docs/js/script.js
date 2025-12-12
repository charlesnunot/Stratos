// Panel switch logic
const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel1') { // Home → hide panel
      dynamicPanel.classList.add('hidden');
      dynamicPanel.querySelectorAll('.panel-section').forEach(panel => panel.classList.remove('active'));
    } else {
      // Show panel
      dynamicPanel.classList.remove('hidden');

      // Show target panel
      dynamicPanel.querySelectorAll('.panel-section').forEach(panel => panel.classList.remove('active'));
      const targetPanel = document.getElementById(panelId);
      if (targetPanel) targetPanel.classList.add('active');
    }
  });
});
