// docs/components/Posts/MarketFollowing.js
import { mountPostsFeed } from './PostsFeed.js';

export function mountMarketFollowing(container) {
  const posts = [
    'Market Following Item 1',
    'Market Following Item 2',
    'Market Following Item 3'
  ];

  mountPostsFeed(container, posts);
}

