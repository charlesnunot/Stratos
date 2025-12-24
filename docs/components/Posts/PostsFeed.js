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
  card.style.cursor = 'pointer';
  card.style.overflow = 'hidden';
  
  // 图片处理
  const imgs = post.images || (post.product_posts?.images ?? []);
  let imagesHTML = '';
  if (imgs.length) {
    imagesHTML = `<div class="post-images" style="display:flex;flex-wrap:wrap;gap:4px;">` +
      imgs.map(url => `<img src="${url}" alt="post image" style="flex:1 1 calc(50% - 4px);height:120px;object-fit:cover;border-radius:6px;">`).join('') +
      `</div>`;
  }

  // 文本/描述处理：最多两行
  let excerpt = post.content || '';
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    excerpt = p.description || excerpt;
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }
  // 限制两行显示
  const excerptHTML = `<p class="post-excerpt" style="
      overflow:hidden;
      display:-webkit-box;
      -webkit-line-clamp:2;
      -webkit-box-orient:vertical;
      line-height:1.2em;
      max-height:2.4em;
      margin:4px 0;
      color:#333;
      font-size:0.95rem;
    ">${excerpt}</p>`;

  // 作者信息 + 互动数悬浮
  const author = post.author || 'User';
  const time = post.created_at ? new Date(post.created_at).toLocaleString() : '';
  const likes = post.likes_count ?? 0;
  const comments = post.comments_count ?? 0;
  const avatarUrl = post.author_avatar || 'https://via.placeholder.com/32';

  const overlayHTML = `
    <div style="
      position:absolute;
      bottom:8px;
      left:8px;
      right:8px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      background:rgba(0,0,0,0.4);
      padding:4px 8px;
      border-radius:6px;
      color:#fff;
      font-size:0.85rem;
    ">
      <div style="display:flex;align-items:center;gap:6px;">
        <img src="${avatarUrl}" alt="avatar" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">
        <span>${author}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span>❤️ ${likes}</span>
        <span>💬 ${comments}</span>
      </div>
    </div>
  `;

  card.innerHTML = `
    ${imagesHTML}
    ${excerptHTML}
    ${overlayHTML}
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
