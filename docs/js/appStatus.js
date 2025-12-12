// 临时模拟 appStatus.js
export function setAppOnline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("offline");
  dot.classList.add("online");
  dot.setAttribute("title", "App Online"); // 提示文字
}

export function setAppOffline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("online");
  dot.classList.add("offline");
  dot.setAttribute("title", "App Offline"); // 提示文字
}
