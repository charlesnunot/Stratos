const baseURL = new URL('.', import.meta.url);

let modal, overlay, closeBtn, titleEl, metaEl, excerptEl, imagesEl;

export async function initPostModal() {
  // 加载 HTML
  const html = await fetch(new URL('PostsModal.html', baseURL)).then(res => res.text());
  document.body.insertAdjacentHTML('beforeend', html);

  // 加载 CSS
  loadCSS(new URL('PostsModal.css', baseURL));

  // 获取元素
  modal = document.getElementById('post-modal');
  overlay = document.getElementById('post-modal-overlay');
  closeBtn = document.getElementById('post-modal-close');
  titleEl = document.getElementById('post-modal-title');
  metaEl = document.getElementById('post-modal-meta');
  excerptEl = document.getElementById('post-modal-excerpt');
  imagesEl = document.getElementById('post-modal-images');

  // 事件绑定
  overlay.addEventListener('click', closePostModal);
  closeBtn.addEventListener('click', closePostModal);
}

/**
 * 打开帖子模态弹窗
 * @param {Object} post 帖子数据
 */
export function openPostModal(post) {
  if (!modal) return;

  // 标题
  titleEl.textContent = post.title || post.product_posts?.title || '';

  // 元信息
  const author = post.author || 'Unknown';
  const time = post.created_at ? new Date(post.created_at).toLocaleString() : '';
  metaEl.innerHTML = `${author} ${time ? ' · ' + time : ''}`;

  // 内容
  let excerpt = post.content || post.product_posts?.description || '';
  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    excerpt += `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }
  excerptEl.textContent = excerpt;

  // 图片
  imagesEl.innerHTML = '';
  const imgs = post.images || post.product_posts?.images || [];
  imgs.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'post image';
    imagesEl.appendChild(img);
  });

  // 显示
  modal.classList.remove('hidden');
}

/**
 * 关闭模态
 */
export function closePostModal() {
  if (!modal) return;
  modal.classList.add('hidden');
}

/**
 * 加载 CSS 工具
 */
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
