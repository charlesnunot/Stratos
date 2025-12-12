export function initToolbar(onPanelChange) {
  const toolbar = document.getElementById("toolbar");
  if (!toolbar) return;

  toolbar.innerHTML = ''; // 如果需要动态加载 HTML，可使用 fetch 或直接 innerHTML
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

