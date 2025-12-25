// import { mountPostsFeed } from './PostsFeed.js';

// export function mountFollowing(container) {
//   const posts = [
//     { title: 'Following Post 1', author: 'Dave', time: '1h ago', excerpt: 'This is the first following post.' },
//     { title: 'Following Post 2', author: 'Eve', time: '2h ago', excerpt: 'This is the second following post.' },
//     { title: 'Following Post 3', author: 'Frank', time: '3h ago', excerpt: 'This is the third following post.' }
//   ];

//   mountPostsFeed(container, posts);
// }

// docs/components/Posts/Following.js
import { mountPostsFeed } from './PostsFeed.js';
import { getUser, subscribe } from '../../store/userManager.js';
import { fetchFollowingFeed } from '../../store/api.js';

/**
 * 挂载 Following 页面帖子流
 * @param {HTMLElement} container
 * @param {Array} cachedPosts 可选，缓存的帖子数组
 * @returns {Array} 实际渲染的帖子数组
 */
export async function mountFollowing(container, cachedPosts = []) {
  if (!container) return cachedPosts;

  if (cachedPosts.length) {
    mountPostsFeed(container, cachedPosts);
    return cachedPosts;
  }

  container.innerHTML = '<p>Loading posts...</p>';

  async function loadFeed() {
    const user = getUser();
    let posts = [];

    try {
      if (!user) {
        container.innerHTML = '<p>请登录查看关注内容</p>';
        return [];
      } else {
        posts = await fetchFollowingFeed(20, 0);
      }
    } catch (err) {
      console.error('拉取关注帖子失败:', err);
      container.innerHTML = '<p>无法加载帖子</p>';
      return [];
    }

    mountPostsFeed(container, posts);
    return posts;
  }

  const posts = await loadFeed();

  subscribe(async user => {
    const newPosts = await loadFeed();
    cachedPosts.splice(0, cachedPosts.length, ...newPosts);
  });

  return posts;
}
