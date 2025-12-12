export function initToolbar(onPanelChange) {
  const toolbar = document.getElementById("toolbar");
  if (!toolbar) return;

  // 动态加载 HTML
  fetch('./components/Toolbar/Toolbar.html')
    .then(res => res.text())
    .then(html => {
      toolbar.innerHTML = html;
      toolbar.querySelectorAll("button[data-panel]").forEach(btn => {
        btn.addEventListener("click", () => {
          const panelId = btn.dataset.panel;
          onPanelChange(panelId);
        });
      });
    });
}
