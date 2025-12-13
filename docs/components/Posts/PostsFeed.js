// docs/components/Posts/PostsFeed.js
const baseURL = new URL('.', import.meta.url);

export async function mountPostsFeed(container, posts) {
  if (!container) return;

  // 加载 HTML 模板
  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载样式
  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  if (!feed) return;

  // 遍历 posts 数据
  posts.forEach(post => {
    feed.appendChild(createPostCard(post));
  });
}

// 创建单条卡片，兼容对象或字符串
function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  let title = '';
  let author = '';
  let time = '';
  let excerpt = '';

  if (typeof post === 'string') {
    // 兼容旧的字符串数组
    title = post;
  } else if (typeof post === 'object' && post !== null) {
    title = post.title || '';
    author = post.author || 'Unknown';
    time = post.time || '';
    excerpt = post.excerpt || '';
  }

  card.innerHTML = `
    <h3 class="post-title">${title}</h3>
    <div class="post-meta">
      ${author ? `<span class="post-author">${author}</span>` : ''}
      ${author && time ? ' · ' : ''}
      ${time ? `<span class="post-time">${time}</span>` : ''}
    </div>
    ${excerpt ? `<p class="post-excerpt">${excerpt}</p>` : ''}
  `;

  return card;
}

// CSS 加载工具
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
