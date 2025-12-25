const baseURL = new URL('./', import.meta.url);

export async function mountPostsFeed(container, postsArray) {
  if (!container || !Array.isArray(postsArray)) return;

  // 加载 HTML
  const html = await fetch(new URL('PostsFeed.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('PostsFeed.css', baseURL));

  const feed = container.querySelector('.posts-feed');
  if (!feed) return;

  // 清空旧内容
  feed.innerHTML = '';

  postsArray.forEach(post => {
    const card = createPostCard(post);
    feed.appendChild(card);
  });
}

function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'post';

  // 作者信息
  const author = post.author || 'User';
  const avatar = post.author_avatar || 'https://via.placeholder.com/40';

  // 帖子统计
  const likes = post.likes_count ?? 0;
  const favorites = post.favorites_count ?? 0;
  const comments = post.comments_count ?? 0;
  const shares = post.shares_count ?? 0;

  // 内容与图片
  const content = post.content || '';
  const translation = post.translation || '';
  const images = post.images || post.product_posts?.images || [];

  // 左侧图片轮播（简单实现：显示第一张）
  const imagesHtml = images.map(url => `<img src="${url}" alt="post image" />`).join('');

  card.innerHTML = `
    <div class="post-left">
      ${imagesHtml || '<img src="https://via.placeholder.com/200x200" alt="post image" />'}
    </div>

    <div class="post-right">
      <div class="post-body">
        <p class="post-excerpt">${content}</p>
        ${translation ? `<p class="post-translation">${translation}</p>` : ''}
      </div>

      <div class="post-actions">
        <div class="left-actions">
          <div class="action"><span class="material-symbols-outlined">favorite</span>${likes}</div>
          <div class="action"><span class="material-symbols-outlined">bookmark</span>${favorites}</div>
          <div class="action"><span class="material-symbols-outlined">comment</span>${comments}</div>
        </div>
        <div class="right-actions">
          <div class="action"><span class="material-symbols-outlined">share</span>${shares}</div>
        </div>
      </div>

      <div class="post-footer">
        <div class="post-author-info">
          <img src="${avatar}" alt="avatar" />
          <span class="post-author-name">${author}</span>
        </div>
        <div class="post-menu">
          <span class="material-symbols-outlined">more_horiz</span>
        </div>
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
