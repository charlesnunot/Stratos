// docs/components/Logo/Logo.js
const baseURL = new URL('.', import.meta.url);

export async function mountLogo(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Logo.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Logo.css', baseURL));
}

// CSS 加载函数（可复用）
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

