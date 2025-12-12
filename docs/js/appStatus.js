/**
 * 设置 APP 在线
 */
export function setAppOnline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("offline");
  dot.classList.add("online");
  dot.title = "App Online";
}

/**
 * 设置 APP 离线
 */
export function setAppOffline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("online");
  dot.classList.add("offline");
  dot.title = "App Offline";
}
