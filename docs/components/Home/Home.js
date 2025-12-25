import { savePageState, getPageState } from '../../store/pageStateStore.js'

async function mountHome(container) {
  // ...原来的 mount 逻辑

  // 尝试恢复状态
  const state = getPageState('home')
  if (state) {
    container.scrollTop = state.scrollTop
    activateTab(state.activeTab)
    renderPosts(state.cachedPosts)
  }

  // 每次切换 tab 或滚动时保存状态
  container.addEventListener('scroll', () => {
    savePageState('home', {
      scrollTop: container.scrollTop,
      activeTab: currentTab,
      cachedPosts
    })
  })
}

const baseURL = new URL('.', import.meta.url);

export async function mountHome(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Home.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Home.css', baseURL));

  // 默认激活 Discover tab
  const defaultTab = container.querySelector('.home-tab[data-tab="discover"]');
  if (defaultTab) defaultTab.classList.add('active');
  loadTabContent('discover');

  // 绑定标题栏点击事件
  const tabs = container.querySelectorAll('.home-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTabContent(tab.dataset.tab);
    });
  });
}

// 根据标签加载内容
async function loadTabContent(tabName) {
  const contentContainer = document.getElementById('home-content');
  if (!contentContainer) return;

  contentContainer.innerHTML = ''; // 清空内容

  switch (tabName) {
    case 'discover': {
      const { mountDiscover } = await import(new URL('../Posts/Discover.js', baseURL));
      mountDiscover(contentContainer);
      break;
    }
    case 'following': {
      const { mountFollowing } = await import(new URL('../Posts/Following.js', baseURL));
      mountFollowing(contentContainer);
      break;
    }
    case 'search': {
      const { mountSearch } = await import(new URL('../Posts/Search/Search.js', baseURL));
      mountSearch(contentContainer);
      break;
    }
    default:
      console.warn('未知标签:', tabName);
  }
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



