const buttons = document.querySelectorAll('#toolbar .top-icons button');
const dynamicPanel = document.getElementById('dynamic-panel');
const panelContent = dynamicPanel.querySelector('.panel-content');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');

    if (panelId === 'panel-user') { // Home → slide out
      panelContent.style.transform = 'translateX(-100%)';
      panelContent.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
    } else { // Show panel → slide in
      panelContent.style.transform = 'translateX(0)';
      panelContent.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
      const targetPanel = document.getElementById(panelId);
      if (targetPanel) targetPanel.classList.add('active');
    }
  });
});
