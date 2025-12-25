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

  const commentsHtml = comments.map(c => `<div class="comment"><strong>${c.user}:</strong> ${c.text}</div>`).join('');

  card.innerHTML = `
    <!-- 用户栏 -->
    <div class="post-header">
      <div class="post-author-info">
        <img src="${avatar}" alt="avatar"/>
        <span class="post-author-name">${author}</span>
      </div>
      <div class="post-menu">...</div>
    </div>

    <!-- 轮播图 -->
    <div class="post-carousel">${imagesHtml}</div>

    <!-- 互动栏 -->
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

    <!-- 内容区 -->
    <div class="post-body">${content}</div>
    <div class="post-translation">${translation || '翻译'}</div>

    <!-- 评论 -->
    <div class="post-comments">${commentsHtml}</div>

    <!-- 输入评论 -->
    <div class="post-comment-input">
      <input type="text" placeholder="Write a comment..." />
      <button>Send</button>
    </div>
  `;

  // 点击内容区展开
  const postBody = card.querySelector('.post-body');
  const commentsEl = card.querySelector('.post-comments');
  const inputEl = card.querySelector('.post-comment-input');
  const translationEl = card.querySelector('.post-translation');

  postBody.addEventListener('click', () => {
    postBody.classList.toggle('expanded');
    commentsEl.classList.toggle('visible');
    inputEl.classList.toggle('visible');
  });

  // 点击翻译切换（具体实现略）
  translationEl.addEventListener('click', () => {
    translationEl.classList.toggle('translated');
    // 翻译内容逻辑可在此实现
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
