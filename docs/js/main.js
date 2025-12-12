// ===============================
// main.js
// ===============================

import { initSidebar } from "./sidebar.js";
import { initUserPanel } from "./user-panel.js";
import { initContent } from "./content.js";

const sidebar = document.getElementById("sidebar-container");
const userPanel = document.getElementById("user-panel-container");

initSidebar(sidebar);
initUserPanel(userPanel);
initContent(document.getElementById("content-container"));

// 当前打开的面板
let openedPanel = null;

export function togglePanel(panelName) {
  if (openedPanel === panelName) {
    // 再次点击 → 收回
    userPanel.classList.remove("active");
    openedPanel = null;
  } else {
    // 展开
    userPanel.classList.add("active");
    openedPanel = panelName;
  }
}
