// docs/components/Home/Home.js
import { mountTabPage } from '../TabPage/TabPage.js';

export function mountHome(container) {
  mountTabPage(container, {
    tabs: [
      {
        key: 'discover',
        label: 'Discover',
        module: '../Posts/Discover.js',
        mount: (m, el) => m.mountDiscover(el)
      },
      {
        key: 'following',
        label: 'Following',
        module: '../Posts/Following.js',
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
