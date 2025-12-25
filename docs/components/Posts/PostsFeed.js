const baseURL = new URL('./', import.meta.url);

export async function mountPostsFeed(container, postsArray) {
  if (!container || !Array.isArray(postsArray)) return;

  container.innerHTML = '<div class="posts-feed"></div>';
  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  feed.innerHTML = '';

  postsArray.forEach(post => {
    const card = createPostCard(post);
    feed.appendChild(card);
  });
}

function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  const author = post.author || 'User';
  const avatar = post.author_avatar || 'https://via.placeholder.com/40';
  const likes = post.likes_count ?? 0;
  const favorites = post.favorites_count ?? 0;
  const commentsCount = post.comments_count ?? 0;
  const shares = post.shares_count ?? 0;
  const content = post.content || '';
  const translation = post.translation || '';
  const images = post.images || post.product_posts?.images || [];
  const comments = post.comments || [];

  const imagesHtml = images.length
    ? images.map(url => `<img src="${url}" alt="post image"/>`).join('')
    : '<img src="https://via.placeholder.com/400x300" alt="placeholder"/>';

  const commentsHtml = comments.slice(0,3).map(c => `<div class="comment"><strong>${c.user}:</strong> ${c.text}</div>`).join('');

  card.innerHTML = `
    <!-- 顶部用户栏 -->
    <div class="post-header">
      <div class="post-author-info">
        <img src="${avatar}" alt="avatar"/>
        <span class="post-author-name">${author}</span>
      </div>
      <div class="post-menu">...</div>
    </div>

    <!-- 轮播图 -->
    <div class="post-carousel">
      ${imagesHtml}
    </div>

    <!-- 底部区域 -->
    <div class="post-actions">
      <div class="left-actions">
        <div class="action"><span class="material-symbols-outlined">favorite</span>${likes}</div>
        <div class="action"><span class="material-symbols-outlined">bookmark</span>${favorites}</div>
        <div class="action"><span class="material-symbols-outlined">comment</span>${commentsCount}</div>
      </div>
      <div class="right-actions">
        <div class="action"><span class="material-symbols-outlined">share</span>${shares}</div>
      </div>
    </div>

    <div class="post-body">${content}${translation ? `<p class="post-translation">${translation}</p>` : ''}</div>

    <div class="post-comments">${commentsHtml}</div>

    <div class="post-comment-input">
      <input type="text" placeholder="Write a comment..." />
      <button>Send</button>
    </div>
  `;

  // 点击展开内容
  const postBody = card.querySelector('.post-body');
  postBody.addEventListener('click', () => {
    postBody.classList.toggle('expanded');
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
