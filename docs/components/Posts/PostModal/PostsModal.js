const baseURL = new URL('.', import.meta.url);

let modal, backdrop, closeBtn, titleEl, metaEl, excerptEl, imagesEl;

/**
 * 初始化模态弹窗，确保 DOM 已插入
 */
export async function initPostModal() {
  if (modal) return; // 已初始化过

  // 插入 HTML
  const html = await fetch(new URL('PostsModal.html', baseURL)).then(r => r.text());
  document.body.insertAdjacentHTML('beforeend', html);

  // 加载 CSS
  loadCSS(new URL('PostsModal.css', baseURL));

  // 获取 DOM 元素
  modal = document.getElementById('post-modal');
  backdrop = document.getElementById('post-modal-backdrop');
  closeBtn = document.getElementById('post-modal-close');
  titleEl = document.getElementById('post-modal-title');
  metaEl = document.getElementById('post-modal-meta');
  excerptEl = document.getElementById('post-modal-excerpt');
  imagesEl = document.getElementById('post-modal-images');

  // 绑定事件
  if (backdrop) backdrop.addEventListener('click', closePostModal);
  if (closeBtn) closeBtn.addEventListener('click', closePostModal);
}

/**
 * 打开帖子模态弹窗
 */
export function openPostModal(post) {
  if (!modal) return;

  // 标题
  let title = post.title || '';
  if (post.type === 'product' && post.product_posts) title = post.product_posts.title || title;

  // 元信息
  let author = post.author || '未知';
  let time = post.created_at ? new Date(post.created_at).toLocaleString() : '';
  metaEl.textContent = `${author}${author && time ? ' · ' : ''}${time}`;

  // 正文/描述
  let excerpt = post.content || '';
  if (post.type === 'product' && post.product_posts) {
    excerpt = post.product_posts.description || excerpt;
    excerpt += `\n价格: ${post.product_posts.price ?? '-'} 元, 库存: ${post.product_posts.stock ?? '-'}`;
  }
  excerptEl.textContent = excerpt;

  // 图片
  const imgs = post.images || (post.product_posts?.images ?? []);
  imagesEl.innerHTML = imgs.length
    ? imgs.map(url => `<img src="${url}" alt="post image">`).join('')
    : '';

  // 显示模态
  modal.classList.add('open');
}

/**
 * 关闭模态
 */
export function closePostModal() {
  if (!modal) return;
  modal.classList.remove('open');
}

/**
 * 加载 CSS
 */
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
