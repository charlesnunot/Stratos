export function initSidebar(container) {
  container.innerHTML = `
    <button title="Home"><i class="fa-solid fa-house"></i></button>
    <button title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
    <button title="Messages"><i class="fa-solid fa-comment"></i></button>
    <button title="Notifications"><i class="fa-solid fa-bell"></i></button>
    <button title="Settings"><i class="fa-solid fa-gear"></i></button>
  `;

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      alert(`Clicked ${btn.title}`);
    });
  });
}
