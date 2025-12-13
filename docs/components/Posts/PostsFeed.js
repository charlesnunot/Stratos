// docs/components/Posts/PostsFeed.js
const baseURL = new URL('.', import.meta.url);

export async function mountPostsFeed(container, posts) {
  if (!container) return;

  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  if (!feed) return;

  posts.forEach(post => {
    feed.appendChild(createPostCard(post));
  });
}

function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  card.innerHTML = `
    <h3 class="post-title">${post.title}</h3>
    <div class="post-meta">
      <span class="post-author">${post.author}</span>
      ·
      <span class="post-time">${post.time}</span>
    </div>
    <p class="post-excerpt">${post.excerpt}</p>
  `;

  return card;
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
