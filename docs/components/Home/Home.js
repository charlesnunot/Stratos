// import { savePageState, getPageState } from '../../store/pageStateStore.js'

// async function mountHome(container) {
//   // ...原来的 mount 逻辑

//   // 尝试恢复状态
//   const state = getPageState('home')
//   if (state) {
//     container.scrollTop = state.scrollTop
//     activateTab(state.activeTab)
//     renderPosts(state.cachedPosts)
//   }

//   // 每次切换 tab 或滚动时保存状态
//   container.addEventListener('scroll', () => {
//     savePageState('home', {
//       scrollTop: container.scrollTop,
//       activeTab: currentTab,
//       cachedPosts
//     })
//   })
// }

// const baseURL = new URL('.', import.meta.url);

// export async function mountHome(container) {
//   if (!container) return;

//   // 加载 HTML
//   const html = await fetch(new URL('Home.html', baseURL)).then(res => res.text());
//   container.innerHTML = html;

//   // 加载 CSS
//   loadCSS(new URL('Home.css', baseURL));

//   // 默认激活 Discover tab
//   const defaultTab = container.querySelector('.home-tab[data-tab="discover"]');
//   if (defaultTab) defaultTab.classList.add('active');
//   loadTabContent('discover');

//   // 绑定标题栏点击事件
//   const tabs = container.querySelectorAll('.home-tab');
//   tabs.forEach(tab => {
//     tab.addEventListener('click', () => {
//       tabs.forEach(t => t.classList.remove('active'));
//       tab.classList.add('active');
//       loadTabContent(tab.dataset.tab);
//     });
//   });
// }

// // 根据标签加载内容
// async function loadTabContent(tabName) {
//   const contentContainer = document.getElementById('home-content');
//   if (!contentContainer) return;

//   contentContainer.innerHTML = ''; // 清空内容

//   switch (tabName) {
//     case 'discover': {
//       const { mountDiscover } = await import(new URL('../Posts/Discover.js', baseURL));
//       mountDiscover(contentContainer);
//       break;
//     }
//     case 'following': {
//       const { mountFollowing } = await import(new URL('../Posts/Following.js', baseURL));
//       mountFollowing(contentContainer);
//       break;
//     }
//     case 'search': {
//       const { mountSearch } = await import(new URL('../Posts/Search/Search.js', baseURL));
//       mountSearch(contentContainer);
//       break;
//     }
//     default:
//       console.warn('未知标签:', tabName);
//   }
// }

// // CSS 加载函数
// function loadCSS(href) {
//   const url = href.toString();
//   if (document.querySelector(`link[href="${url}"]`)) return;
//   const link = document.createElement('link');
//   link.rel = 'stylesheet';
//   link.href = url;
//   document.head.appendChild(link);
// }


// docs/components/Home/Home.js
import { savePageState, getPageState } from '../../store/pageStateStore.js'

const baseURL = new URL('.', import.meta.url)

let currentTab = 'discover'
let cachedPosts = []

export async function mountHome(container, cachedState = null) {
  if (!container) return

  // 加载 HTML
  const html = await fetch(new URL('Home.html', baseURL)).then(res => res.text())
  container.innerHTML = html

  // 加载 CSS
  loadCSS(new URL('Home.css', baseURL))

  const tabs = container.querySelectorAll('.home-tab')
  const contentContainer = container.querySelector('#home-content')

  // 绑定 tab 点击事件
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      currentTab = tab.dataset.tab
      loadTabContent(currentTab)
    })
  })

  // 尝试恢复状态
  if (cachedState) {
    container.scrollTop = cachedState.scrollTop || 0
    currentTab = cachedState.activeTab || 'discover'
    cachedPosts = cachedState.cachedPosts || []
    activateTab(currentTab)
    renderPosts(cachedPosts)
  } else {
    loadTabContent(currentTab)
  }

  // 保存滚动状态
  container.addEventListener('scroll', () => {
    savePageState('home', {
      scrollTop: container.scrollTop,
      activeTab: currentTab,
      cachedPosts
    })
  })

  // =========================
  // 辅助函数
  // =========================
  function activateTab(tabName) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName))
  }

  async function loadTabContent(tabName) {
    if (!contentContainer) return
    contentContainer.innerHTML = '<p>Loading...</p>'

    let posts = []

    switch (tabName) {
      case 'discover': {
        const { mountDiscover } = await import(new URL('../Posts/Discover.js', baseURL))
        posts = await mountDiscover(contentContainer)
        break
      }
      case 'following': {
        const { mountFollowing } = await import(new URL('../Posts/Following.js', baseURL))
        posts = await mountFollowing(contentContainer)
        break
      }
      case 'search': {
        const { mountSearch } = await import(new URL('../Posts/Search/Search.js', baseURL))
        posts = await mountSearch(contentContainer)
        break
      }
      default:
        console.warn('未知标签:', tabName)
    }

    cachedPosts = posts || []
  }

  function renderPosts(posts) {
    if (!contentContainer) return
    contentContainer.innerHTML = ''
    if (!posts || posts.length === 0) return
    const ul = document.createElement('ul')
    ul.style.listStyle = 'none'
    ul.style.padding = '0'
    posts.forEach(it => {
      const li = document.createElement('li')
      li.textContent = it
      li.style.padding = '8px'
      li.style.borderBottom = '1px solid #eee'
      ul.appendChild(li)
    })
    contentContainer.appendChild(ul)
  }
}

// 导出保存状态函数
export function savePageState() {
  const container = document.querySelector('.home-container')
  if (!container) return null
  return {
    scrollTop: container.scrollTop,
    activeTab: currentTab,
    cachedPosts
  }
}

// =========================
// CSS 加载函数
// =========================
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}




