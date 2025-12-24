// docs/components/Sidebar/Sidebar.js
import { mountLogo } from '../Logo/Logo.js'
import { subscribe as subscribeUser } from '../../store/userManager.js'
import {
  subscribeSystemMessages,
  getUnreadCount
} from '../../store/systemMessageStore.js'

const baseURL = new URL('.', import.meta.url)

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

  // 监听自定义导航事件
  window.addEventListener('sidebar:navigate', onSidebarNavigate)
}

// =========================
// 挂载导航项
// =========================
function mountNavItems() {
  mountNavItem('#nav-home', 'home')
  mountNavItem('#nav-market', 'market')
  mountNavItem('#nav-publish', 'publish')
  mountMessagesNav('#nav-messages')
  mountNavItem('#nav-profile', 'profile')
}

async function mountNavItem(selector, page) {
  const target = document.querySelector(selector)
  if (!target) return

  switch (page) {
    case 'home': {
      const { mountNavHome } = await import(new URL('../NavHome/NavHome.js', baseURL))
      mountNavHome(target)
      target.addEventListener('click', () => loadMainPage('home'))
      target.click()
      break
    }
    case 'market': {
      const { mountNavMarket } = await import(new URL('../NavMarket/NavMarket.js', baseURL))
      mountNavMarket(target)
      target.addEventListener('click', () => loadMainPage('market'))
      break
    }
    case 'publish': {
      if (!target.innerHTML) {
        target.innerHTML = `
          <span class="material-symbols-outlined nav-icon">publish</span>
          <span class="nav-label">Publish</span>
        `
      }
      target.addEventListener('click', async () => {
        await loadMainPage('publish')
        updateActiveNav('publish')
      })
      break
    }
    case 'profile': {
      if (!target.innerHTML) {
        target.innerHTML = `
          <span class="material-symbols-outlined nav-icon">person</span>
          <span class="nav-label">Profile</span>
        `
      }
      target.addEventListener('click', async () => {
        await loadMainPage('profile')
        updateActiveNav('profile')
      })
      break
    }
    default:
      console.warn('未处理的导航项:', page)
  }
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

  target.addEventListener('click', async () => {
    await loadMainPage('messages')
    updateActiveNav('messages')
  })

  subscribeUser(user => {
    if (!user) badge.style.display = 'none'
  })

  subscribeSystemMessages(() => {
    const count = getUnreadCount()
    badge.textContent = count > 99 ? '99+' : count
    badge.style.display = count > 0 ? 'inline-flex' : 'none'
  })
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

  mainRoot.innerHTML = ''

  try {
    switch (page) {
      case 'home': {
        const { mountHome } = await import(new URL('../Home/Home.js', baseURL))
        mountHome(mainRoot)
        break
      }
      case 'market': {
        const { mountMarket } = await import(new URL('../Market/Market.js', baseURL))
        mountMarket(mainRoot)
        break
      }
      case 'publish': {
        const { mountPublish } = await import(new URL('../Publish/Publish.js', baseURL))
        mountPublish(mainRoot)
        break
      }
      case 'messages': {
        const { mountMessages } = await import(new URL('../Messages/Messages.js', baseURL))
        mountMessages(mainRoot)
        break
      }
      case 'profile': {
        const { mountProfile } = await import(new URL('../Profile/Profile.js', baseURL))
        mountProfile(mainRoot)
        break
      }
      default:
        console.warn('未实现的页面:', page)
    }
  } catch (err) {
    console.error(`加载 ${page} 页面失败:`, err)
  }
}

// =========================
// Sidebar 自定义事件处理
// =========================
function onSidebarNavigate(e) {
  const { page } = e.detail || {}
  if (!page) return
  loadMainPage(page)
  updateActiveNav(page)
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
