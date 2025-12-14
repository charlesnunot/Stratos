let modal = null;
let posts = [];
let currentIndex = 0;

export async function initPostModal(postsArray, startIndex = 0) {
  posts = postsArray;
  currentIndex = startIndex;

  if (!modal) {
    const html = await fetch(new URL('PostsModal.html', import.meta.url)).then(res => res.text());
    document.body.insertAdjacentHTML('beforeend', html);
    loadCSS(new URL('PostsModal.css', import.meta.url));

    modal = document.querySelector('.post-modal');
    modal.querySelector('.modal-close').addEventListener('click', () => modal.style.display = 'none');
    modal.querySelector('.modal-prev').addEventListener('click', () => showPost(currentIndex - 1));
    modal.querySelector('.modal-next').addEventListener('click', () => showPost(currentIndex + 1));
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });

    // 键盘左右切换帖子
    document.addEventListener('keydown', e => {
      if (!modal || modal.style.display !== 'flex') return;
      if (e.key === 'ArrowLeft') showPost(currentIndex - 1);
      if (e.key === 'ArrowRight') showPost(currentIndex + 1);
    });
  }

  showPost(currentIndex);
  modal.style.display = 'flex';
}

function showPost(index) {
  if (!posts || posts.length === 0) return;

  if (index < 0) index = posts.length - 1;
  if (index >= posts.length) index = 0;
  currentIndex = index;

  const post = posts[currentIndex];
  const titleEl = modal.querySelector('.modal-title');
  const contentEl = modal.querySelector('.modal-content');
  const imagesContainer = modal.querySelector('.modal-images');

  titleEl.textContent = post.type === 'product' ? post.product_posts?.title || post.title : post.title || '';
  contentEl.textContent = post.type === 'product' && post.product_posts
    ? (post.product_posts.description || post.content || '') + `\n价格: ${post.product_posts.price ?? '-'} 元, 库存: ${post.product_posts.stock ?? '-'}` 
    : post.content || '';

  imagesContainer.innerHTML = '';
  const imgs = post.images || (post.product_posts?.images ?? []);
  imgs.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'post image';
    imagesContainer.appendChild(img);
  });
}

// 动态加载 CSS
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
