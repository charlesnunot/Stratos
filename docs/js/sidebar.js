export function initSidebar(container) {
  container.innerHTML = `
    <div id="sidebar">
      <button title="Home"><i class="fas fa-home"></i></button>
      <button title="Search"><i class="fas fa-search"></i></button>
      <button title="Messages"><i class="fas fa-comment-alt"></i></button>
      <button title="Notifications"><i class="fas fa-bell"></i></button>
      <button title="Settings"><i class="fas fa-cog"></i></button>
    </div>
  `;

  const buttons = container.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      alert(`Clicked ${btn.title}`);
    });
  });
}
