let modal = null;
let posts = [];
let currentIndex = 0;
let currentImageIndex = 0;

export async function initPostModal(postsArray, startIndex = 0) {
  posts = postsArray;
  currentIndex = startIndex;

  if (!modal) {
    const html = await fetch(new URL('PostsModal.html', import.meta.url)).then(r => r.text());
    document.body.insertAdjacentHTML('beforeend', html);
    modal = document.querySelector('.post-modal');

    loadCSS(new URL('PostsModal.css', import.meta.url));

    modal.querySelector('.modal-close').addEventListener('click', () => modal.style.display = 'none');
    modal.querySelector('.carousel-prev').addEventListener('click', () => showImage(currentImageIndex - 1));
    modal.querySelector('.carousel-next').addEventListener('click', () => showImage(currentImageIndex + 1));

    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });

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
  if (index < 0 || index >= posts.length) { modal.style.display = 'none'; return; }

  currentIndex = index;
  const post = posts[currentIndex];

  // 作者信息
  modal.querySelector('.author-avatar').src = post.author_avatar || 'https://via.placeholder.com/40';
  modal.querySelector('.author-name').textContent = post.author || 'User';

  // 内容
  modal.querySelector('.modal-title').textContent = post.title || '';
  modal.querySelector('.modal-content').textContent = post.content || '';

  // 操作数
  modal.querySelector('.modal-actions .favorite .count').textContent = post.likes_count ?? 0;
  modal.querySelector('.modal-actions .comment .count').textContent = post.comments_count ?? 0;
  modal.querySelector('.modal-actions .share .count').textContent = post.shares_count ?? 0;

  // 图片轮播
  const imgs = post.images || [];
  const imagesContainer = modal.querySelector('.modal-images');
  imagesContainer.innerHTML = '';
  imgs.forEach((url, idx) => {
    const img = document.createElement('img');
    img.src = url;
    img.style.display = idx === 0 ? 'block' : 'none';
    imagesContainer.appendChild(img);
  });
  currentImageIndex = 0;
}

function showImage(idx) {
  const imgs = modal.querySelectorAll('.modal-images img');
  if (!imgs.length) return;
  if (idx < 0) idx = imgs.length - 1;
  if (idx >= imgs.length) idx = 0;

  imgs.forEach((img, i) => img.style.display = i === idx ? 'block' : 'none');
  currentImageIndex = idx;
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
