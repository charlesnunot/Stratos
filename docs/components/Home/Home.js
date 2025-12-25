// docs/components/Home/Home.js
import { savePageState, getPageState } from '../../store/pageStateStore.js';

const baseURL = new URL('.', import.meta.url);

// 保存每个 tab 的缓存数据和滚动位置
const tabState = {
  discover: { cachedPosts: [], scrollTop: 0 },
  following: { cachedPosts: [], scrollTop: 0 },
  search: { cachedPosts: [], scrollTop: 0 }
};

let currentTab = 'discover';

export async function mountHome(container, savedState) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Home.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Home.css', baseURL));

  // 尝试恢复状态
  if (savedState) {
    currentTab = savedState.activeTab || 'discover';
    for (const tab of Object.keys(tabState)) {
      if (savedState[tab]) tabState[tab] = savedState[tab];
    }
  }

  const contentContainer = container.querySelector('#home-content');
  if (!contentContainer) return;

  // 绑定 tab 点击事件
  const tabs = container.querySelectorAll('.home-tab');
  tabs.forEach(tabEl => {
    const tabName = tabEl.dataset.tab;
    tabEl.classList.toggle('active', tabName === currentTab);
    tabEl.addEventListener('click', async () => {
      // 保存当前 tab 状态
      saveCurrentTabState(contentContainer);
      // 更新当前 tab
      currentTab = tabName;
      // 激活样式
      tabs.forEach(t => t.classList.remove('active'));
      tabEl.classList.add('active');
      // 加载内容
      await loadTabContent(tabName, contentContainer);
    });
  });

  // 只绑定一次滚动事件
  if (!contentContainer._scrollListenerBound) {
    contentContainer.addEventListener(
      'scroll',
      () => {
        tabState[currentTab].scrollTop = contentContainer.scrollTop;
        saveAllTabsState();
      },
      { passive: true }
    );
    contentContainer._scrollListenerBound = true;
  }

  // 初次加载内容
  await loadTabContent(currentTab, contentContainer);
}

// 保存当前 tab 状态
function saveCurrentTabState(contentContainer) {
  if (!contentContainer) return;
  tabState[currentTab].scrollTop = contentContainer.scrollTop;
  saveAllTabsState();
}

// 加载 tab 内容
async function loadTabContent(tabName, contentContainer) {
  if (!contentContainer) return;

  // 先显示缓存内容
  contentContainer.innerHTML = tabState[tabName].cachedPosts?.length
    ? renderCachedPosts(tabState[tabName].cachedPosts)
    : '<p>Loading posts...</p>';

  let posts = [];
  try {
    switch (tabName) {
      case 'discover': {
        const { mountDiscover } = await import(new URL('../Posts/Discover.js', baseURL));
        posts = await mountDiscover(contentContainer, tabState[tabName].cachedPosts);
        break;
      }
      case 'following': {
        const { mountFollowing } = await import(new URL('../Posts/Following.js', baseURL));
        posts = await mountFollowing(contentContainer, tabState[tabName].cachedPosts);
        break;
      }
      case 'search': {
        const { mountSearch } = await import(new URL('../Posts/Search/Search.js', baseURL));
        posts = await mountSearch(contentContainer, tabState[tabName].cachedPosts);
        break;
      }
      default:
        console.warn('未知标签:', tabName);
    }
  } catch (err) {
    console.error(`加载 ${tabName} 内容失败:`, err);
  }

  tabState[tabName].cachedPosts = posts;

  // 恢复滚动位置，确保 DOM 已渲染
  requestAnimationFrame(() => {
    contentContainer.scrollTop = tabState[tabName].scrollTop;
  });
}

// 渲染缓存 posts（按实际 HTML 格式修改）
function renderCachedPosts(posts) {
  return posts.map(p => `<div class="post-item">${p.content || ''}</div>`).join('');
}

// 保存所有 tab 状态到 pageStateStore
function saveAllTabsState() {
  savePageState('home', {
    activeTab: currentTab,
    discover: tabState.discover,
    following: tabState.following,
    search: tabState.search
  });
}

// CSS 加载函数
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
