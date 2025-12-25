// // docs/components/Posts/Discover.js
// import { mountPostsFeed } from './PostsFeed.js';
// import { getUser, subscribe } from '../../store/userManager.js';
// import { fetchDefaultFeed } from '../../store/api.js';

// /**
//  * 挂载 Discover 页面帖子流
//  * @param {HTMLElement} container
//  */
// export async function mountDiscover(container) {
//   if (!container) return;

//   // 创建 loading 占位
//   container.innerHTML = '<p>Loading posts...</p>';

//   async function loadFeed() {
//     const user = getUser();
//     let posts = [];

//     try {
//       if (user) {
//         // 登录用户：暂时显示文本占位
//         container.innerHTML = `<p>这里是登录用户的帖子流（个性化推荐尚未实现）</p>`;
//         return;
//       } else {
//         // 未登录用户：调用默认帖子流
//         posts = await fetchDefaultFeed(20, 0);
//       }
//     } catch (err) {
//       console.error('拉取帖子失败:', err);
//       container.innerHTML = '<p>无法加载帖子</p>';
//       return;
//     }

//     // 渲染帖子
//     console.log('[PostsFeed] posts =', posts);
//     mountPostsFeed(container, posts);
//   }

//   // 首次加载
//   await loadFeed();

//   // 监听用户登录状态变化，刷新帖子流
//   subscribe(user => {
//     loadFeed();
//   });
// }


// docs/components/Posts/Discover.js
import { mountPostsFeed } from './PostsFeed.js';
import { getUser, subscribe } from '../../store/userManager.js';
import { fetchDefaultFeed } from '../../store/api.js';

/**
 * 挂载 Discover 页面帖子流
 * @param {HTMLElement} container
 * @param {Array} cachedPosts 可选，缓存的帖子数组
 * @returns {Array} 实际渲染的帖子数组
 */
export async function mountDiscover(container, cachedPosts = []) {
  if (!container) return cachedPosts;

  // 如果有缓存直接渲染
  if (cachedPosts.length) {
    mountPostsFeed(container, cachedPosts);
    return cachedPosts;
  }

  // 创建 loading 占位
  container.innerHTML = '<p>Loading posts...</p>';

  async function loadFeed() {
    const user = getUser();
    let posts = [];

    try {
      if (user) {
        // 登录用户：暂时显示文本占位
        container.innerHTML = `<p>这里是登录用户的帖子流（个性化推荐尚未实现）</p>`;
        return [];
      } else {
        // 未登录用户：调用默认帖子流
        posts = await fetchDefaultFeed(20, 0);
      }
    } catch (err) {
      console.error('拉取帖子失败:', err);
      container.innerHTML = '<p>无法加载帖子</p>';
      return [];
    }

    // 渲染帖子
    mountPostsFeed(container, posts);
    return posts;
  }

  // 首次加载
  const posts = await loadFeed();

  // 监听用户登录状态变化，刷新帖子流
  subscribe(async user => {
    const newPosts = await loadFeed();
    cachedPosts.splice(0, cachedPosts.length, ...newPosts);
  });

  return posts;
}

