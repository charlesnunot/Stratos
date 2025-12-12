export const initDynamicPanel = {
  init() {
    const container = document.getElementById("dynamic-panel");
    if (!container) return;

    const panelIds = [
      'panel-user', 'panel2','panel3','panel4',
      'panel5','panel6','panel7','panel8'
    ];

    panelIds.forEach((id, index) => {
      const div = document.createElement('div');
      div.id = id;
      div.className = 'panel-section';
      if (index === 0) div.classList.add('active'); // 默认显示 panel-user
      container.appendChild(div);
    });
  },
  showPanel(panelId) {
    document.querySelectorAll(".panel-section").forEach(p => p.classList.remove("active"));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");
  }
};
