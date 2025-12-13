// docs/components/TabPage/TabPage.js
const baseURL = new URL('.', import.meta.url);

export async function mountTabPage(container, config) {
  if (!container) return;

  const html = await fetch(new URL('TabPage.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 使用统一布局样式
  loadCSS(new URL('../Home/Home.css', baseURL));

  const header = container.querySelector('#tab-header');
  const content = container.querySelector('#tab-content');

  // 创建 tabs
  config.tabs.forEach((tab, index) => {
    const btn = document.createElement('button');
    btn.className = 'home-tab';
    btn.dataset.tab = tab.key;
    btn.textContent = tab.label;

    if (index === 0) btn.classList.add('active');

    btn.addEventListener('click', () => {
      header.querySelectorAll('.home-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadTab(tab);
    });

    header.appendChild(btn);
  });

  // 默认加载第一个
  loadTab(config.tabs[0]);

  async function loadTab(tab) {
    content.innerHTML = '';
    const module = await import(tab.module);
    tab.mount(module, content);
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
