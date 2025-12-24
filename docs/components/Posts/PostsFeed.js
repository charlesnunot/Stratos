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

  /* ========= 图片 ========= */
  const images = post.images || post.product_posts?.images || [];
  const imageHTML = images.length
    ? `
      <div class="post-image-wrapper">
        <img src="${images[0]}" alt="post image" />
      </div>
    `
    : '';

  /* ========= 内容（2 行） ========= */
  let excerpt = post.content || '';
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    excerpt = p.description || excerpt;
  }

  /* ========= 作者 ========= */
  const author = post.author || 'User';
  const avatar = post.author_avatar || 'https://via.placeholder.com/40';
  const followCount = post.following_count ?? 0;

  /* ========= 悬浮互动 ========= */
  const likes = post.likes_count ?? 0;
  const favorites = post.favorites_count ?? 0;
  const shares = post.shares_count ?? 0;

  card.innerHTML = `
    ${imageHTML}

    <p class="post-excerpt">${excerpt}</p>

    <div class="post-author-row">
      <div class="post-author-info">
        <img src="${avatar}" />
        <span class="post-author-name">${author}</span>
      </div>
      <div class="post-follow">
        关注 ${followCount}
      </div>
    </div>

    <div class="post-hover-actions">
      <div class="action">
        <span class="material-symbols-outlined">favorite</span>
        ${likes}
      </div>
      <div class="action">
        <span class="material-symbols-outlined">bookmark</span>
        ${favorites}
      </div>
      <div class="action">
        <span class="material-symbols-outlined">share</span>
        ${shares}
      </div>
    </div>
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
