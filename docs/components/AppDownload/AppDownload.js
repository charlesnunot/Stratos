const baseURL = new URL('.', import.meta.url);

export async function mountAppDownload(container) {
  if (!container) return;

  const html = await fetch(new URL('AppDownload.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  loadCSS(new URL('AppDownload.css', baseURL));

  container.querySelector('.download-item.ios')
    ?.addEventListener('click', () => {
      window.open('https://example.com/ios-download', '_blank');
    });

  container.querySelector('.download-item.android')
    ?.addEventListener('click', () => {
      window.open('https://example.com/android-download', '_blank');
    });
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
