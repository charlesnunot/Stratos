export function initUserStats(containerId, stats = { following: 102, followers: 230, likes: 58 }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  fetch('./components/UserPanel/UserStats/UserStats.html')
    .then(res => res.text())
    .then(html => {
      container.innerHTML = html;
      const statItems = container.querySelectorAll(".stat-item");
      statItems[0].querySelector(".stat-count").textContent = stats.following;
      statItems[1].querySelector(".stat-count").textContent = stats.followers;
      statItems[2].querySelector(".stat-count").textContent = stats.likes;
    });
}

