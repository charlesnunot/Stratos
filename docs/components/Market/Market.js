// docs/components/Market/Market.js
import { mountTabPage } from '../TabPage/TabPage.js';

export function mountMarket(container) {
  mountTabPage(container, {
    tabs: [
      {
        key: 'discover',
        label: 'Discover',
        module: '../Posts/MarketDiscover.js',
        mount: (m, el) => m.mountMarketDiscover(el)
      },
      {
        key: 'trending',
        label: 'Trending',
        module: '../Posts/MarketTrending.js',
        mount: (m, el) => m.mountMarketTrending(el)
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
