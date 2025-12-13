import { mountPostsFeed } from './PostsFeed.js';

export function mountMarketFollowing(container) {
  const posts = [
    { title: 'Market Following 1', author: 'Shop X', time: '1d ago', excerpt: 'Details about following item 1' },
    { title: 'Market Following 2', author: 'Shop Y', time: '2d ago', excerpt: 'Details about following item 2' },
    { title: 'Market Following 3', author: 'Shop Z', time: '3d ago', excerpt: 'Details about following item 3' }
  ];

  mountPostsFeed(container, posts);
}
