export function initUserPanel() {
  const container = document.getElementById("panel-user");
  if (!container) return;

  fetch('./components/UserPanel/UserPanel.html')
    .then(res => res.text())
    .then(html => {
      container.innerHTML = html;

      const bio = container.querySelector("#user-bio");
      if (bio) {
        bio.addEventListener("click", () => alert(bio.dataset.full));
      }
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

