const baseURL = new URL('.', import.meta.url);

export function mountSearch(container) {
  container.innerHTML = `
    <div class="post">Search Post 1</div>
    <div class="post">Search Post 2</div>
    <div class="post">Search Post 3</div>
  `;
}

