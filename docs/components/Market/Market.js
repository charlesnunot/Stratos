// docs/components/Market/Market.js

const baseURL = new URL('.', import.meta.url);

export async function mountMarket(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Market.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Market.css', baseURL));

  // 初始化各区域
  mountFilters();
  mountMarketContent();
}

/* =========================
   Filters（占位）
========================= */

function mountFilters() {
  const filtersEl = document.getElementById('market-filters');
  if (!filtersEl) return;

  // 先占位，后面可以模块化
  filtersEl.innerHTML = `
    <div style="color:#888;font-size:14px;">
      Filters (coming soon)
    </div>
  `;
}

/* =========================
   Content（占位）
========================= */

function mountMarketContent() {
  const contentEl = document.getElementById('market-content');
  if (!contentEl) return;

  // 临时占位
  contentEl.innerHTML = `
    <div style="color:#666;">
      Market content goes here
    </div>
  `;
}

/* =========================
   Utils
========================= */

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

