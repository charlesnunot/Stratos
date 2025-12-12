// ===== 面板切换 =====
const buttons = document.querySelectorAll('#toolbar button');
const panels = document.querySelectorAll('.panel-section');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-panel');
    panels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === target) panel.classList.add('active');
    });
  });
});
