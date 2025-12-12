import { togglePanel } from "./main.js";

export function initSidebar(container) {
  container.innerHTML = `
    <div class="sidebar-icon" data-panel="user">
      <i class="fa-solid fa-user"></i>
    </div>
    <div class="sidebar-icon" data-panel="settings">
      <i class="fa-solid fa-gear"></i>
    </div>
  `;

  container.querySelectorAll(".sidebar-icon").forEach(icon => {
    icon.addEventListener("click", () => {
      const panel = icon.dataset.panel;
      togglePanel(panel);
    });
  });
}

