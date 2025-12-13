const baseURL = new URL('.', import.meta.url);

export function mountDiscover(container) {
  container.innerHTML = `
    <div class="post">Discover Post 1</div>
    <div class="post">Discover Post 2</div>
    <div class="post">Discover Post 3</div>
  `;
}

