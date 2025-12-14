import { initPostModal, openPostModal } from './PostsModal.js';
const baseURL = new URL('.', import.meta.url);

export async function mountPostsFeed(container, posts) {
  if (!container) return;

  // 确保模态弹窗已初始化
  await initPostModal();

  // 插入 feed 容器
  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;
  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  if (!feed) return;

  // 渲染帖子卡片
  posts.forEach(post => {
    const card = createPostCard(post);
    feed.appendChild(card);

    // 点击卡片打开模态
    card.addEventListener('click', () => openPostModal(post));
  });
}

/**
 * 创建单条卡片
 */
function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  let title = post.title || '';
  let author = post.author || '未知';
  let time = post.created_at ? new Date(post.created_at).toLocaleString() : '';
  let excerpt = post.content || '';

  // 商品帖子
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    title = p.title || title;
    excerpt = p.description || excerpt;
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }

  // 图片
  const imgs = post.images || (post.product_posts?.images ?? []);
  const imagesHTML = imgs.length
    ? `<div class="post-images">${imgs.map(url => `<img src="${url}" alt="post image">`).join('')}</div>`
    : '';

  card.innerHTML = `
    <h3 class="post-title">${title}</h3>
    <div class="post-meta">${author}${author && time ? ' · ' : ''}${time}</div>
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
