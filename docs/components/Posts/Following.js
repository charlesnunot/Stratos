const baseURL = new URL('.', import.meta.url);

export function mountFollowing(container) {
  container.innerHTML = `
    <div class="post">Following Post 1</div>
    <div class="post">Following Post 2</div>
    <div class="post">Following Post 3</div>
  `;
}

