// docs/components/Market/Market.js
import { mountTabPage } from '../TabPage/TabPage.js';

export async function mountMarket(container) {
  if (!container) return;

  await mountTabPage(container, {
    tabs: [
      {
        key: 'discover',
        label: 'Discover',
        module: '../Posts/MarketDiscover.js',
        mount: (m, el) => m.mountMarketDiscover(el)
      },
      {
        key: 'following',
        label: 'Following',
        module: '../Posts/MarketFollowing.js',
        mount: (m, el) => m.mountFollowing(el)
      },
      {
        key: 'search',
        label: 'Search',
        module: '../Posts/Search/Search.js',
        mount: (m, el) => m.mountSearch(el)
      }
    ]
  });
}
