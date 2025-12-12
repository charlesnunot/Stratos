export function initContent(container) {
  container.innerHTML = `
    <div class="content-panel">
      <h3>Main Feed</h3>
      <p>Posts appear here...</p>
    </div>
  `;

  container.style.flex = '1';
  container.style.background = '#fff';
  container.style.padding = '12px';
}
