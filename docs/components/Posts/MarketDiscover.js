// docs/components/Posts/MarketDiscover.js
import { mountPostsFeed } from './PostsFeed.js';

export function mountMarketDiscover(container) {
  const posts = [
    'Market Discover Item 1',
    'Market Discover Item 2',
    'Market Discover Item 3'
  ];

  mountPostsFeed(container, posts);
}

