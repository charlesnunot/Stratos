// docs/components/Market/Market.js

const baseURL = new URL('.', import.meta.url);

export async function mountMarket(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Market.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Market.css', baseURL));

  // 默认激活 Discover
  const defaultTab = container.querySelector('.market-tab[data-tab="discover"]');
  if (defaultTab) defaultTab.classList.add('active');
  loadTabContent('discover');

  // 绑定 tab 点击
  const tabs = container.querySelectorAll('.market-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTabContent(tab.dataset.tab);
    });
  });
}

async function loadTabContent(tabName) {
  const content = document.getElementById('market-content');
  if (!content) return;

  content.innerHTML = '';

  switch (tabName) {
    case 'discover': {
      const { mountMarketDiscover } = await import(
        new URL('../Posts/MarketDiscover.js', baseURL)
      );
      mountMarketDiscover(content);
      break;
    }
    case 'trending': {
      const { mountMarketTrending } = await import(
        new URL('../Posts/MarketTrending.js', baseURL)
      );
      mountMarketTrending(content);
      break;
    }
    case 'search': {
      const { mountSearch } = await import(
        new URL('../Posts/Search/Search.js', baseURL)
      );
      mountSearch(content);
      break;
    }
    default:
      console.warn('未知 Market tab:', tabName);
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
