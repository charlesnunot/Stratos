const baseURL = new URL('.', import.meta.url);

let modalOverlay, modalClose, modalTitle, modalMeta, modalExcerpt, modalImages;

export async function initPostModal() {
  // 加载 HTML
  const html = await fetch(new URL('PostsModal.html', baseURL)).then(res => res.text());
  document.body.insertAdjacentHTML('beforeend', html);

  // 加载 CSS
  loadCSS(new URL('PostsModal.css', baseURL));

  modalOverlay = document.getElementById('post-modal-overlay');
  modalClose = document.getElementById('modal-close');
  modalTitle = document.getElementById('modal-title');
  modalMeta = document.getElementById('modal-meta');
  modalExcerpt = document.getElementById('modal-excerpt');
  modalImages = document.getElementById('modal-images');

  modalClose.addEventListener('click', closePostModal);
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closePostModal();
  });
}

/**
 * 打开帖子详情弹窗
 * @param {Object} post 帖子对象
 */
export function openPostModal(post) {
  if (!modalOverlay) return;

  // 普通帖子
  let title = post.title || '';
  let author = post.author || 'Unknown';
  let time = post.time || (post.created_at ? new Date(post.created_at).toLocaleString() : '');
  let excerpt = post.content || '';

  // 商品帖子
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    title = p.title || title;
    excerpt = p.description || excerpt;
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }

  modalTitle.textContent = title;
  modalMeta.textContent = `${author}${author && time ? ' · ' : ''}${time}`;
  modalExcerpt.textContent = excerpt;

  // 图片
  modalImages.innerHTML = '';
  const imgs = post.images || (post.product_posts?.images ?? []);
  imgs.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'post image';
    modalImages.appendChild(img);
  });

  modalOverlay.style.display = 'flex';
}

export function closePostModal() {
  if (modalOverlay) modalOverlay.style.display = 'none';
}

// CSS 加载工具
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

