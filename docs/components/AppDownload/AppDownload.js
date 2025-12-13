const baseURL = new URL('.', import.meta.url);

export async function mountAppDownload(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('AppDownload.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('AppDownload.css', baseURL));

  // 挂载按钮跳转
  const iosBtn = container.querySelector('.btn.ios');
  const androidBtn = container.querySelector('.btn.android');

  iosBtn.addEventListener('click', () => {
    window.open('https://example.com/ios-download', '_blank');
  });

  androidBtn.addEventListener('click', () => {
    window.open('https://example.com/android-download', '_blank');
  });
}

// 加载 CSS
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

