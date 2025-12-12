export function initAvatarWrapper(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  fetch('./components/UserPanel/AvatarWrapper/AvatarWrapper.html')
    .then(res => res.text())
    .then(html => {
      container.innerHTML = html;
    });
}

export function setAppOnline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("offline");
  dot.classList.add("online");
  dot.title = "App Online";
}

export function setAppOffline() {
  const dot = document.getElementById("app-status-dot");
  if (!dot) return;
  dot.classList.remove("online");
  dot.classList.add("offline");
  dot.title = "App Offline";
}

