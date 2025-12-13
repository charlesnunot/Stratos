// Following.js
import { mountPostsFeed } from './PostsFeed.js';

export function mountFollowing(container) {
  const posts = [
    'Following Post 1',
    'Following Post 2',
    'Following Post 3'
  ];
  mountPostsFeed(container, posts);
}
