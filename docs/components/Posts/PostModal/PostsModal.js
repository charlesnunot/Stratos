const baseURL = new URL('./', import.meta.url);

let modal = null;

export async function initPostModal(post) {
  if (!modal) {
    // 创建 modal 容器
    const html = await fetch(new URL('PostsModal.html', baseURL)).then(res => res.text());
    document.body.insertAdjacentHTML('beforeend', html);

    // 加载 CSS
    loadCSS(new URL('PostsModal.css', baseURL));

    modal = document.querySelector('.post-modal');

    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 点击空白关闭
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // 填充帖子数据
  modal.querySelector('.modal-title').textContent = post.title || '';
  modal.querySelector('.modal-content').textContent = post.content || '';

  if (post.type === 'product' && post.product_posts) {
    const p = post.product_posts;
    modal.querySelector('.modal-title').textContent = p.title || post.title;
    modal.querySelector('.modal-content').textContent =
      (p.description || post.content) + `\n价格: ${p.price ?? '-'} 元, 库存: ${p.stock ?? '-'}`;
  }

  // 图片
  const imagesContainer = modal.querySelector('.modal-images');
  imagesContainer.innerHTML = '';
  const imgs = post.images || (post.product_posts?.images ?? []);
  imgs.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'post image';
    imagesContainer.appendChild(img);
  });

  modal.style.display = 'flex';
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
