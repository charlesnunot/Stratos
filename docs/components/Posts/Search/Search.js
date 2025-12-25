// const baseURL = new URL('.', import.meta.url);

// export async function mountSearch(container) {
//   // 加载 HTML
//   const html = await fetch(new URL('Search.html', baseURL)).then(res => res.text());
//   container.innerHTML = html;

//   // 加载 CSS
//   loadCSS(new URL('Search.css', baseURL));

//   // 渲染搜索结果
//   const postsContainer = container.querySelector('.posts-feed');
//   const posts = ['Search Post 1', 'Search Post 2', 'Search Post 3'];
//   posts.forEach(post => {
//     const div = document.createElement('div');
//     div.className = 'post';
//     div.textContent = post;
//     postsContainer.appendChild(div);
//   });
// }

// function loadCSS(href) {
//   const url = href.toString();
//   if (document.querySelector(`link[href="${url}"]`)) return;
//   const link = document.createElement('link');
//   link.rel = 'stylesheet';
//   link.href = url;
//   document.head.appendChild(link);
// }

// docs/components/Posts/Search/Search.js
import { mountPostsFeed } from '../PostsFeed.js';
import { getUser, subscribe } from '../../../store/userManager.js';
import { searchPosts } from '../../../store/api.js';

/**
 * 挂载 Search 页面帖子流
 * @param {HTMLElement} container
 * @param {Array} cachedPosts 可选，缓存的帖子数组
 * @param {string} query 可选，搜索关键词
 * @returns {Array} 实际渲染的帖子数组
 */
export async function mountSearch(container, cachedPosts = [], query = '') {
  if (!container) return cachedPosts;

  if (cachedPosts.length) {
    mountPostsFeed(container, cachedPosts);
    return cachedPosts;
  }

  container.innerHTML = '<p>Loading search results...</p>';

  async function loadFeed() {
    let posts = [];
    try {
      if (!query) {
        container.innerHTML = '<p>请输入搜索内容</p>';
        return [];
      } else {
        posts = await searchPosts(query, 20, 0);
      }
    } catch (err) {
      console.error('搜索帖子失败:', err);
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
