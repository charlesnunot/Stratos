import { openPostModal, initPostModal } from './PostModal/PostsModal.js';

const baseURL = new URL('.', import.meta.url);

export async function mountPostsFeed(container, posts) {
  if (!container) return;

  // 初始化模态弹窗（只需要初始化一次）
  await initPostModal();

  // 加载 HTML 模板
  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载样式
  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  if (!feed) return;

  // 遍历 posts 数据，生成卡片
  posts.forEach(post => {
    const card = createPostCard(post);
    feed.appendChild(card);

    // 点击卡片打开模态弹窗
    card.addEventListener('click', () => openPostModal(post));
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
