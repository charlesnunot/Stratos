export function initNickname(containerId, name = "Keyong") {
  const container = document.getElementById(containerId);
  if (!container) return;

  fetch('./components/UserPanel/Nickname/Nickname.html')
    .then(res => res.text())
    .then(html => {
      container.innerHTML = html;
      container.querySelector(".nickname").textContent = name;
    });
}

