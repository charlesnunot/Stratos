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

  const author = post.author || 'User';
  const avatar = post.author_avatar || 'https://via.placeholder.com/40';
  const likes = post.likes_count ?? 0;
  const favorites = post.favorites_count ?? 0;
  const comments = post.comments_count ?? 0;
  const shares = post.shares_count ?? 0;
  const content = post.content || '';
  const translation = post.translation || '';
  const images = post.images || post.product_posts?.images || [];
  const imgUrl = images[0] || '';

  card.innerHTML = `
    <!-- 头部 -->
    <div class="post-header">
      <div class="post-author-info">
        <img src="${avatar}" alt="avatar" />
        <span class="post-author-name">${author}</span>
      </div>
      <div class="post-menu">
        <span class="material-symbols-outlined">more_horiz</span>
      </div>
    </div>

    <!-- 图片 -->
    <div class="post-image">
      <img src="${imgUrl}" alt="post image" />
    </div>

    <!-- 操作栏 -->
    <div class="post-actions">
      <div class="left-actions">
        <div class="action">
          <span class="material-symbols-outlined">favorite</span>${likes}
        </div>
        <div class="action">
          <span class="material-symbols-outlined">bookmark</span>${favorites}
        </div>
        <div class="action">
          <span class="material-symbols-outlined">comment</span>${comments}
        </div>
      </div>
      <div class="right-actions">
        <div class="action">
          <span class="material-symbols-outlined">share</span>${shares}
        </div>
      </div>
    </div>

    <!-- 内容 -->
    <p class="post-excerpt">${content}</p>
    ${translation ? `<p class="post-translation">${translation}</p>` : ''}
  `;

  // TODO: 右上菜单点击逻辑可在这里加 eventListener

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
