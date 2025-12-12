export function setAppOnline() {
  const dot = document.getElementById("app-status-dot");
  const text = document.getElementById("app-status-text");
  if (!dot || !text) return;
  dot.classList.remove("offline");
  dot.classList.add("online");
  text.textContent = "Online";
}

export function setAppOffline() {
  const dot = document.getElementById("app-status-dot");
  const text = document.getElementById("app-status-text");
  if (!dot || !text) return;
  dot.classList.remove("online");
  dot.classList.add("offline");
  text.textContent = "Offline";
}
