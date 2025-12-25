// // docs/components/Sidebar/Sidebar.js
// import { mountLogo } from '../Logo/Logo.js'
// import { subscribe as subscribeUser } from '../../store/userManager.js'
// import {
//   subscribeSystemMessages,
//   getUnreadCount
// } from '../../store/systemMessageStore.js'

// const baseURL = new URL('.', import.meta.url)

// // =========================
// // 主函数：挂载 Sidebar
// // =========================
// export async function mountSidebar(container) {
//   if (!container) return

//   // 加载 HTML
//   const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text())
//   container.innerHTML = html

//   // 加载 CSS
//   loadCSS(new URL('Sidebar.css', baseURL))

//   // 挂载 Logo
//   const topEl = document.getElementById('sidebar-top')
//   if (topEl) mountLogo(topEl)

//   // 挂载导航项
//   mountNavItems()

//   // 挂载底部按钮
//   mountSidebarBottom()

//   // 监听自定义导航事件
//   window.addEventListener('sidebar:navigate', onSidebarNavigate)
// }

// // =========================
// // 挂载导航项
// // =========================
// function mountNavItems() {
//   mountNavItem('#nav-home', 'home')
//   mountNavItem('#nav-market', 'market')
//   mountNavItem('#nav-publish', 'publish')
//   mountMessagesNav('#nav-messages')
//   mountNavItem('#nav-profile', 'profile')
// }

// async function mountNavItem(selector, page) {
//   const target = document.querySelector(selector)
//   if (!target) return

//   switch (page) {
//     case 'home': {
//       const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL))
//       mountNavHome(target)
//       target.addEventListener('click', () => loadMainPage('home'))
//       target.click()
//       break
//     }
//     case 'market': {
//       const { mountNavMarket } = await import(new URL('../NavMarket/NavMarket.js', baseURL))
//       mountNavMarket(target)
//       target.addEventListener('click', () => loadMainPage('market'))
//       break
//     }
//     case 'publish': {
//       if (!target.innerHTML) {
//         target.innerHTML = `
//           <span class="material-symbols-outlined nav-icon">publish</span>
//           <span class="nav-label">Publish</span>
//         `
//       }
//       target.addEventListener('click', async () => {
//         await loadMainPage('publish')
//       })
//       break
//     }
//     case 'profile': {
//       if (!target.innerHTML) {
//         target.innerHTML = `
//           <span class="material-symbols-outlined nav-icon">person</span>
//           <span class="nav-label">Profile</span>
//         `
//       }
//       target.addEventListener('click', async () => {
//         await loadMainPage('profile')
//       })
//       break
//     }
//     default:
//       console.warn('未处理的导航项:', page)
//   }
// }

// // =========================
// // Messages 导航
// // =========================
// function mountMessagesNav(selector) {
//   const target = document.querySelector(selector)
//   if (!target) return

//   if (!target.innerHTML) {
//     target.innerHTML = `
//       <span class="material-symbols-outlined nav-icon">message</span>
//       <span class="nav-label">Messages</span>
//       <span class="nav-badge" style="display:none;"></span>
//     `
//   }

//   const badge = target.querySelector('.nav-badge')

//   target.addEventListener('click', async () => {
//     await loadMainPage('messages')
//   })

//   subscribeUser(user => {
//     if (!user) badge.style.display = 'none'
//   })

//   subscribeSystemMessages(() => {
//     const count = getUnreadCount()
//     badge.textContent = count > 99 ? '99+' : count
//     badge.style.display = count > 0 ? 'inline-flex' : 'none'
//   })
// }

// // =========================
// // 底部功能按钮
// // =========================
// async function mountSidebarBottom() {
//   const moreBtn = document.getElementById('nav-more')
//   const appBtn = document.getElementById('nav-app-download')

//   if (moreBtn) {
//     try {
//       const { mountMore } = await import(new URL('../More/More.js', baseURL))
//       mountMore(document.body, moreBtn)
//     } catch (err) {
//       console.error('加载 More 菜单失败:', err)
//     }
//   }

//   if (appBtn) {
//     appBtn.addEventListener('click', async () => {
//       const mainRoot = document.getElementById('main-root')
//       if (!mainRoot) return

//       mainRoot.innerHTML = ''

//       try {
//         const { mountAppDownload } = await import(
//           new URL('../AppDownload/AppDownload.js', baseURL)
//         )
//         mountAppDownload(mainRoot)
//       } catch (err) {
//         console.error('加载 App 下载页面失败:', err)
//       }
//     })
//   }
// }

// // =========================
// // 页面加载逻辑
// // =========================
// async function loadMainPage(page) {
//   const mainRoot = document.getElementById('main-root')
//   if (!mainRoot) return

//   mainRoot.innerHTML = ''

//   try {
//     switch (page) {
//       case 'home': {
//         const { mountHome } = await import(new URL('../Home/Home.js', baseURL))
//         mountHome(mainRoot)
//         break
//       }
//       case 'market': {
//         const { mountMarket } = await import(new URL('../Market/Market.js', baseURL))
//         mountMarket(mainRoot)
//         break
//       }
//       case 'publish': {
//         const { mountPublish } = await import(new URL('../Publish/Publish.js', baseURL))
//         await mountPublish(mainRoot)
//         break
//       }
//       case 'messages': {
//         const { mountMessages } = await import(new URL('../Messages/Messages.js', baseURL))
//         mountMessages(mainRoot)
//         break
//       }
//       case 'profile': {
//         const { mountProfile } = await import(new URL('../Profile/Profile.js', baseURL))
//         mountProfile(mainRoot)
//         break
//       }
//       default:
//         console.warn('未实现的页面:', page)
//     }

//     // 页面加载完成后更新导航高亮
//     updateActiveNav(page)
//   } catch (err) {
//     console.error(`加载 ${page} 页面失败:`, err)
//   }
// }

// // =========================
// // Sidebar 自定义事件处理
// // =========================
// function onSidebarNavigate(e) {
//   const { page } = e.detail || {}
//   if (!page) return
//   loadMainPage(page)
// }

// // =========================
// // 工具函数
// // =========================
// function updateActiveNav(activePage) {
//   document.querySelectorAll('.nav-item[data-page]').forEach(item => {
//     const page = item.dataset.page
//     item.classList.toggle('active', page === activePage)
//   })
// }

// function loadCSS(href) {
//   const url = href.toString()
//   if (document.querySelector(`link[href="${url}"]`)) return
//   const link = document.createElement('link')
//   link.rel = 'stylesheet'
//   link.href = url
//   document.head.appendChild(link)
// }




// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js'
import { subscribe as subscribeUser, getUser } from '../../store/userManager.js'
import {
  subscribeSystemMessages,
  getUnreadCount
} from '../../store/systemMessageStore.js'

const baseURL = new URL('.', import.meta.url)

// -----------------------------
// 全局缓存
// -----------------------------
const pageCache = {}       // 页面 DOM 缓存
const pageScrollCache = {} // 页面 scrollTop 缓存
let currentPage = null

// -----------------------------
// 导航配置
// -----------------------------
const NAV_MAP = {
  home: { module: '../Home/Home.js', mountFn: 'mountHome' },
  market: { module: '../Market/Market.js', mountFn: 'mountMarket' },
  publish: { module: '../Publish/Publish.js', mountFn: 'mountPublish' },
  messages: { module: '../Messages/Messages.js', mountFn: 'mountMessages' },
  profile: { module: '../Profile/Profile.js', mountFn: 'mountProfile' }
}

// =========================
// 主函数：挂载 Sidebar
// =========================
export async function mountSidebar(container) {
  if (!container) return

  // 加载 HTML
  const html = await fetch(new URL('Sidebar.html', baseURL)).then(res => res.text())
  container.innerHTML = html

  // 加载 CSS
  loadCSS(new URL('Sidebar.css', baseURL))

  // 挂载 Logo
  const topEl = document.getElementById('sidebar-top')
  if (topEl) mountLogo(topEl)

  // 挂载导航项
  mountNavItems()

  // 挂载底部按钮
  mountSidebarBottom()

  // 初始化默认页面
  await loadMainPage('home')

  // 监听自定义导航事件
  window.addEventListener('sidebar:navigate', onSidebarNavigate)
}

// =========================
// 挂载导航项
// =========================
function mountNavItems() {
  Object.keys(NAV_MAP).forEach(page => {
    if (page === 'messages') mountMessagesNav('#nav-messages')
    else mountNavItem(`#nav-${page}`, page)
  })
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector)
  if (!target) return

  if (!target.innerHTML) {
    const iconMap = {
      home: 'home',
      market: 'storefront',
      publish: 'publish',
      profile: 'person'
    }
    const icon = iconMap[page] || 'help'
    target.innerHTML = `
      <span class="material-symbols-outlined nav-icon">${icon}</span>
      <span class="nav-label">${page.charAt(0).toUpperCase() + page.slice(1)}</span>
    `
  }

  target.addEventListener('click', async () => {
    await loadMainPage(page)
  })
}

// =========================
// Messages 导航
// =========================
function mountMessagesNav(selector) {
  const target = document.querySelector(selector)
  if (!target) return

  if (!target.innerHTML) {
    target.innerHTML = `
      <span class="material-symbols-outlined nav-icon">message</span>
      <span class="nav-label">Messages</span>
      <span class="nav-badge" style="display:none;"></span>
    `
  }

  const badge = target.querySelector('.nav-badge')

  // 点击跳转
  target.addEventListener('click', async () => {
    await loadMainPage('messages')
  })

  // 用户状态变化
  subscribeUser(user => {
    badge.style.display = user ? badge.style.display : 'none'
  })

  // 系统消息变化
  subscribeSystemMessages(() => {
    const count = getUnreadCount()
    badge.textContent = count > 99 ? '99+' : count
    badge.style.display = count > 0 ? 'inline-flex' : 'none'
  })

  // 初始 badge
  const initCount = getUnreadCount()
  badge.textContent = initCount > 99 ? '99+' : initCount
  badge.style.display = initCount > 0 ? 'inline-flex' : 'none'
}

// =========================
// 底部功能按钮
// =========================
async function mountSidebarBottom() {
  const moreBtn = document.getElementById('nav-more')
  const appBtn = document.getElementById('nav-app-download')

  if (moreBtn) {
    try {
      const { mountMore } = await import(new URL('../More/More.js', baseURL))
      mountMore(document.body, moreBtn)
    } catch (err) {
      console.error('加载 More 菜单失败:', err)
    }
  }

  if (appBtn) {
    appBtn.addEventListener('click', async () => {
      const mainRoot = document.getElementById('main-root')
      if (!mainRoot) return

      mainRoot.innerHTML = ''
      try {
        const { mountAppDownload } = await import(
          new URL('../AppDownload/AppDownload.js', baseURL)
        )
        mountAppDownload(mainRoot)
      } catch (err) {
        console.error('加载 App 下载页面失败:', err)
      }
    })
  }
}

// =========================
// 页面加载逻辑
// =========================
async function loadMainPage(page) {
  const mainRoot = document.getElementById('main-root')
  if (!mainRoot) return

  // 保存当前页面 scrollTop
  if (currentPage && mainRoot.firstChild) {
    pageScrollCache[currentPage] = mainRoot.scrollTop
  }

  // 检查缓存
  if (pageCache[page]) {
    mainRoot.innerHTML = ''
    mainRoot.appendChild(pageCache[page])
  } else {
    // 页面未缓存，动态 import
    const { module, mountFn } = NAV_MAP[page] || {}
    if (!module || !mountFn) {
      console.warn('未实现的页面:', page)
      return
    }

    mainRoot.innerHTML = ''

    try {
      const mod = await import(new URL(module, baseURL))
      const pageEl = document.createElement('div')
      await mod[mountFn](pageEl)
      mainRoot.appendChild(pageEl)
      pageCache[page] = pageEl
    } catch (err) {
      console.error(`加载 ${page} 页面失败:`, err)
    }
  }

  // 恢复 scrollTop
  mainRoot.scrollTop = pageScrollCache[page] || 0

  currentPage = page

  // 更新导航高亮
  updateActiveNav(page)
}

// =========================
// Sidebar 自定义事件处理
// =========================
function onSidebarNavigate(e) {
  const { page } = e.detail || {}
  if (!page) return
  loadMainPage(page)
}

// =========================
// 工具函数
// =========================
function updateActiveNav(activePage) {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const page = item.dataset.page
    item.classList.toggle('active', page === activePage)
  })
}

function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}

