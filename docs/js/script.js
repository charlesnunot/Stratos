import { setAppOnline, setAppOffline } from "./appStatus.js";

const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');
const panels = dynamicPanel.querySelectorAll('.panel-section');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel-user') {
      // Home → fold dynamic panel
      dynamicPanel.classList.add('hidden');
      panels.forEach(p => p.classList.remove('active'));

      // Simulate offline for demo
      setAppOffline();
      return;
    }

    // Show dynamic panel
    dynamicPanel.classList.remove('hidden');
    panels.forEach(p => p.classList.remove('active'));

    const target = document.getElementById(panelId);
    if (target) target.classList.add('active');

    // Simulate online
    setAppOnline();
  });
});
