import { mountPostsFeed } from './PostsFeed.js';

export function mountDiscover(container) {
  const posts = ['Discover Post 1', 'Discover Post 2', 'Discover Post 3'];
  mountPostsFeed(container, posts);
}
