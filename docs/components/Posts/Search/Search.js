const baseURL = new URL('.', import.meta.url);

export async function mountSearch(container) {
  // 加载 HTML
  const html = await fetch(new URL('Search.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Search.css', baseURL));

  // 示例渲染初始结果
  const resultsContainer = container.querySelector('.search-results');
  const posts = ['Search Post 1', 'Search Post 2', 'Search Post 3'];
  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post';
    div.textContent = post;
    resultsContainer.appendChild(div);
  });
}

// CSS 加载函数
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

