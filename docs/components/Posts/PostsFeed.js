import { initPostModal } from './PostModal/PostsModal.js';

const baseURL = new URL('./', import.meta.url);

export async function mountPostsFeed(container, postsArray) {
  if (!container) return;

  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;
  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  if (!feed) return;

  postsArray.forEach((post, i) => {
    const card = createPostCard(post);
    feed.appendChild(card);

    // 点击卡片弹模态，传入整个帖子数组和当前索引
    card.addEventListener('click', () => initPostModal(postsArray, i));
  });
}

function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  let title = post.title || '';
  let author = post.author || 'Unknown';
  let time = post.time || (post.created_at ? new Date(post.created_at).toLocaleString() : '');
  let excerpt = post.content || '';

  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    title = p.title || title;
    excerpt = p.description || excerpt;
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }

  let imagesHTML = '';
  const imgs = post.images || (post.product_posts?.images ?? []);
  if (imgs.length) {
    imagesHTML = `<div class="post-images">
      ${imgs.map(url => `<img src="${url}" alt="post image">`).join('')}
    </div>`;
  }

  card.innerHTML = `
    <h3 class="post-title">${title}</h3>
    <div class="post-meta">
      ${author ? `<span class="post-author">${author}</span>` : ''}
      ${author && time ? ' · ' : ''}
      ${time ? `<span class="post-time">${time}</span>` : ''}
    </div>
    ${excerpt ? `<p class="post-excerpt">${excerpt}</p>` : ''}
    ${imagesHTML}
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
