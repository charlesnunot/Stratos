export const initDynamicPanel = {
  showPanel(panelId) {
    document.querySelectorAll(".panel-section").forEach(p => p.classList.remove("active"));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");
  }
};

