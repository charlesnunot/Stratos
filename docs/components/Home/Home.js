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
// docs/components/Home/Home.js
import { savePageState, getPageState } from '../../store/pageStateStore.js'

const baseURL = new URL('.', import.meta.url)

let currentTab = 'discover'      // 当前激活的 tab
let cachedPosts = {}              // 各 tab 的缓存数据

export async function mountHome(container, state) {
  if (!container) return

  // ----------------------
  // 1️⃣ 加载 HTML
  // ----------------------
  const html = await fetch(new URL('Home.html', baseURL)).then(res => res.text())
  container.innerHTML = html

  // ----------------------
  // 2️⃣ 加载 CSS
  // ----------------------
  loadCSS(new URL('Home.css', baseURL))

  // ----------------------
  // 3️⃣ 尝试恢复状态
  // ----------------------
  if (state) {
    currentTab = state.activeTab || 'discover'
    cachedPosts = state.cachedPosts || {}
  }

  // ----------------------
  // 4️⃣ 初始化 tab
  // ----------------------
  const tabs = container.querySelectorAll('.home-tab')
  tabs.forEach(tab => {
    const tabName = tab.dataset.tab
    if (tabName === currentTab) tab.classList.add('active')
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      currentTab = tabName
      loadTabContent(tabName)
    })
  })

  // ----------------------
  // 5️⃣ 加载当前 tab 内容
  // ----------------------
  loadTabContent(currentTab)

  // =======================
  // 6️⃣ 滚动监听，保存状态
  // =======================
  container.saveStateBeforeUnload = () => {
    const state = {
      scrollTop: container.scrollTop,
      activeTab: currentTab,
      cachedPosts
    }
    console.log('[Home] saveStateBeforeUnload -> scrollTop:', state.scrollTop)
    return state
  }
  
  container.addEventListener('scroll', () => {
    const state = container.saveStateBeforeUnload()
    savePageState('home', state)
    console.log('[Home] scroll event -> scrollTop:', state.scrollTop)
  })
  
  // 恢复状态
  if (state && state.scrollTop) {
    console.log('[Home] restoring scrollTop:', state.scrollTop)
    container.scrollTop = state.scrollTop
  }

// =========================
// 加载 tab 内容
// =========================
async function loadTabContent(tabName) {
  const contentContainer = document.getElementById('home-content')
  if (!contentContainer) return

  contentContainer.innerHTML = '' // 清空内容

  // 如果有缓存数据，直接渲染
  if (cachedPosts[tabName]) {
    renderPosts(contentContainer, cachedPosts[tabName])
    return
  }

  let mountFn = null
  switch (tabName) {
    case 'discover':
      mountFn = (await import(new URL('../Posts/Discover.js', baseURL))).mountDiscover
      break
    case 'following':
      mountFn = (await import(new URL('../Posts/Following.js', baseURL))).mountFollowing
      break
    case 'search':
      mountFn = (await import(new URL('../Posts/Search/Search.js', baseURL))).mountSearch
      break
    default:
      console.warn('未知标签:', tabName)
  }

  if (mountFn) {
    const posts = await mountFn(contentContainer)
    cachedPosts[tabName] = posts
  }
}

// =========================
// 渲染 posts 的通用函数
// =========================
function renderPosts(container, posts) {
  container.innerHTML = ''
  const ul = document.createElement('ul')
  ul.style.listStyle = 'none'
  ul.style.padding = '0'
  posts.forEach(p => {
    const li = document.createElement('li')
    li.textContent = p
    li.style.padding = '8px'
    li.style.borderBottom = '1px solid #eee'
    ul.appendChild(li)
  })
  container.appendChild(ul)
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
