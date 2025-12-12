// appStatus.js

/**
 * 设置 APP 在线（绿色状态点）
 */
export function setAppOnline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("offline");
  dot.classList.add("online");
}

/**
 * 设置 APP 离线（红色状态点）
 */
export function setAppOffline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("online");
  dot.classList.add("offline");
}

