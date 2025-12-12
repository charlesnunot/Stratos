export function initUserBio(containerId, bioText, fullText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  fetch('./components/UserPanel/UserBio/UserBio.html')
    .then(res => res.text())
    .then(html => {
      container.innerHTML = html;
      const bio = container.querySelector("#user-bio");
      if (bio) {
        bio.textContent = bioText;
        bio.dataset.full = fullText;
        bio.addEventListener("click", () => alert(bio.dataset.full));
      }
    });
}

