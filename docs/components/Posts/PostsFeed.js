const baseURL = new URL('.', import.meta.url);

export async function mountPostsFeed(container, posts) {
  // 加载 HTML
  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('PostsFeed.css', baseURL));

  // 渲染帖子
  const feedContainer = container.querySelector('.posts-feed');
  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post';
    div.textContent = post;
    feedContainer.appendChild(div);
  });
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
