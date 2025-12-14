// docs/components/Posts/MarketDiscover.js
import { mountPostsFeed } from './PostsFeed.js';
import { fetchDefaultProductPosts } from '../../store/api.js';

/**
 * 挂载 Market 页面产品帖子流
 * @param {HTMLElement} container
 */
export async function mountMarketDiscover(container) {
  if (!container) return;

  // 创建 loading 占位
  container.innerHTML = '<p>Loading market posts...</p>';

  try {
    // 调用 API 获取产品帖子
    const posts = await fetchDefaultProductPosts(20, 0);

    // 调试打印
    console.log('[MarketDiscover] fetched posts =', posts);

    // 渲染帖子
    mountPostsFeed(container, posts);
  } catch (err) {
    console.error('拉取产品帖子失败:', err);
    container.innerHTML = '<p>无法加载产品帖子</p>';
  }
}
