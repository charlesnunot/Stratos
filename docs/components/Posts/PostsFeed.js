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

/**
 * 创建单条卡片，兼容普通帖子和商品帖子
 */
function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  // 普通帖子字段
  let title = post.title || '';
  let author = post.author || 'Unknown';
  let time = post.time || (post.created_at ? new Date(post.created_at).toLocaleString() : '');
  let excerpt = post.content || '';

  // 商品帖子字段
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    title = p.title || title;
    excerpt = p.description || excerpt;
    // 拼接价格/库存信息
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }

  // 处理图片（如果有）
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

// CSS 加载工具
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
