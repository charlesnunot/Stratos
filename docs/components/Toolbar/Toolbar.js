export function initToolbar(onPanelChange) {
  const toolbar = document.getElementById("toolbar");
  if (!toolbar) return;

  // 加载 HTML
  fetch('./components/Toolbar/Toolbar.html')
    .then(res => res.text())
    .then(html => {
      toolbar.innerHTML = html;

      // 顶部按钮点击事件
      toolbar.querySelectorAll("button[data-panel]").forEach(btn => {
        btn.addEventListener("click", () => {
          const panelId = btn.dataset.panel;
          if (onPanelChange) onPanelChange(panelId);
        });
      });

      // 底部 More 按钮折叠动态面板
      const moreBtn = toolbar.querySelector(".bottom-icon button");
      if (moreBtn) {
        moreBtn.addEventListener("click", () => {
          const dynamicPanel = document.getElementById("dynamic-panel");
          if (dynamicPanel) dynamicPanel.classList.toggle("hidden");
        });
      }
    });
}
