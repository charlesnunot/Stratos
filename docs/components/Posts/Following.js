import { mountPostsFeed } from './PostsFeed.js';

export function mountFollowing(container) {
  const posts = [
    { title: 'Following Post 1', author: 'Dave', time: '1h ago', excerpt: 'This is the first following post.' },
    { title: 'Following Post 2', author: 'Eve', time: '2h ago', excerpt: 'This is the second following post.' },
    { title: 'Following Post 3', author: 'Frank', time: '3h ago', excerpt: 'This is the third following post.' }
  ];

  mountPostsFeed(container, posts);
}

