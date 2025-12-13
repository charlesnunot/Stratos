import { mountPostsFeed } from './PostsFeed.js';

export function mountDiscover(container) {
  const posts = [
    { title: 'Discover Post 1', author: 'Alice', time: '1h ago', excerpt: 'This is the first discover post.' },
    { title: 'Discover Post 2', author: 'Bob', time: '2h ago', excerpt: 'This is the second discover post.' },
    { title: 'Discover Post 3', author: 'Charlie', time: '3h ago', excerpt: 'This is the third discover post.' }
  ];

  mountPostsFeed(container, posts);
}
