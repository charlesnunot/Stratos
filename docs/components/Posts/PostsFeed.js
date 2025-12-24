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
  card.style.position = 'relative';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '6px';
  card.style.cursor = 'pointer';
  card.style.overflow = 'hidden';
  card.style.borderRadius = '8px';
  card.style.backgroundColor = '#fff';
  card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

  // 图片区块
  const imgs = post.images || (post.product_posts?.images ?? []);
  let mainImg = imgs[0] || '';
  const imageHTML = mainImg
    ? `<div class="post-image-wrapper" style="position:relative; width:100%; aspect-ratio:4/3; overflow:hidden; border-radius:8px;">
        <img src="${mainImg}" alt="post image" style="width:100%; height:100%; object-fit:cover;">
      </div>`
    : '';

  // 帖子内容：最多两行
  let excerpt = post.content || '';
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    excerpt = p.description || excerpt;
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }
  const excerptHTML = `<p class="post-excerpt" style="
      overflow:hidden;
      display:-webkit-box;
      -webkit-line-clamp:2;
      -webkit-box-orient:vertical;
      line-height:1.2em;
      max-height:2.4em;
      margin:0 6px;
      font-size:0.95rem;
      color:#333;
    ">${excerpt}</p>`;

  // 作者信息 + 关注
  const author = post.author || 'User';
  const avatarUrl = post.author_avatar || 'https://via.placeholder.com/32';
  const followingCount = post.following_count ?? 0;
  const authorHTML = `
    <div class="post-author-row" style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:0 6px 6px 6px;
      font-size:0.85rem;
      color:#555;
    ">
      <div style="display:flex; align-items:center; gap:6px;">
        <img src="${avatarUrl}" alt="avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
        <span>${author}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span>关注 ${followingCount}</span>
      </div>
    </div>`;

  // 互动悬浮图标（初始隐藏）
  const likes = post.likes_count ?? 0;
  const favorites = post.favorites_count ?? 0;
  const shares = post.shares_count ?? 0;
  const overlayHTML = `
    <div class="post-overlay-actions" style="
      position:absolute;
      top:0;
      left:0;
      width:100%;
      height:100%;
      background:rgba(0,0,0,0.25);
      display:flex;
      justify-content:center;
      align-items:center;
      gap:16px;
      opacity:0;
      transition:opacity 0.2s;
      border-radius:8px;
      color:#fff;
      font-weight:600;
      font-size:1.1rem;
    ">
      <span class="material-symbols-outlined">favorite</span> ${likes}
      <span class="material-symbols-outlined">bookmark</span> ${favorites}
      <span class="material-symbols-outlined">share</span> ${shares}
    </div>`;

  card.innerHTML = `${imageHTML}${excerptHTML}${authorHTML}${overlayHTML}`;

  // 悬浮显示互动
  const overlay = card.querySelector('.post-overlay-actions');
  card.addEventListener('mouseenter', () => {
    overlay.style.opacity = '1';
  });
  card.addEventListener('mouseleave', () => {
    overlay.style.opacity = '0';
  });

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
