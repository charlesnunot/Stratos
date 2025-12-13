import { mountPostsFeed } from './PostsFeed.js';

export function mountMarketDiscover(container) {
  const posts = [
    { title: 'Market Item 1', author: 'Shop A', time: '1d ago', excerpt: 'Description of item 1' },
    { title: 'Market Item 2', author: 'Shop B', time: '2d ago', excerpt: 'Description of item 2' },
    { title: 'Market Item 3', author: 'Shop C', time: '3d ago', excerpt: 'Description of item 3' }
  ];

  mountPostsFeed(container, posts);
}
