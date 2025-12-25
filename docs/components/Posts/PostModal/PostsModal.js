let modal = null;
let posts = [];
let currentIndex = 0;
let currentImageIndex = 0;

export async function initPostModal(postsArray, startIndex = 0) {
  posts = postsArray;
  currentIndex = startIndex;

  if (!modal) {
    const htmlUrl = new URL('./PostsModal.html', import.meta.url);
    const cssUrl = new URL('./PostsModal.css', import.meta.url);

    const html = await fetch(htmlUrl).then(res => res.text());
    document.body.insertAdjacentHTML('beforeend', html);
    loadCSS(cssUrl);

    modal = document.querySelector('.post-modal');
    if (!modal) throw new Error('PostsModal.html 加载失败');

    const closeBtn = modal.querySelector('.modal-close');
    const prevBtn = modal.querySelector('.carousel-prev');
    const nextBtn = modal.querySelector('.carousel-next');

    if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
    if (prevBtn) prevBtn.addEventListener('click', () => showImage(currentImageIndex - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => showImage(currentImageIndex + 1));

    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

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
  if (index < 0 || index >= posts.length) {
    modal.style.display = 'none';
    return;
  }

  currentIndex = index;
  const post = posts[currentIndex];

  modal.querySelector('.author-avatar').src = post.author_avatar || 'https://via.placeholder.com/40';
  modal.querySelector('.author-name').textContent = post.author || 'User';

  modal.querySelector('.modal-title').textContent = post.title || '';
  modal.querySelector('.modal-content').textContent = post.content || '';

  modal.querySelector('.modal-actions .favorite .count').textContent = post.likes_count ?? 0;
  modal.querySelector('.modal-actions .comment .count').textContent = post.comments_count ?? 0;
  modal.querySelector('.modal-actions .share .count').textContent = post.shares_count ?? 0;

  const imagesContainer = modal.querySelector('.modal-images');
  imagesContainer.innerHTML = '';
  const imgs = post.images || [];
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
