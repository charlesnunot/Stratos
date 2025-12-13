const baseURL = new URL('.', import.meta.url);

export async function mountProfileNav(container, onClick) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('ProfileNav.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('ProfileNav.css', baseURL));

  const navItem = container.querySelector('.profile-nav-item');
  if (!navItem) return;

  navItem.addEventListener('click', () => {
    if (typeof onClick === 'function') onClick();
    setActive(true);
  });

  function setActive(active) {
    navItem.classList.toggle('active', active);
  }
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

