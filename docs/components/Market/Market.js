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
        key: 'following',
        label: 'Following',
        module: '../Posts/MarketFollowing.js',
        mount: (m, el) => m.mountMarketFollowing(el)
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
