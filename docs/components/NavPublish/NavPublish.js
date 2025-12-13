const baseURL = new URL('.', import.meta.url);

export async function mountNavPublish(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('NavPublish.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('NavPublish.css', baseURL));

  // 绑定点击事件
  const btn = container.querySelector('.nav-item');
  if (btn) {
    btn.addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('sidebar:navigate', {
          detail: { page: 'publish' }
        })
      );
    });
  }
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

