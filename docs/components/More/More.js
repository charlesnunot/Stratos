import { signOut } from '../../store/supabase.js'
import { clearUser, getUser } from '../../store/userManager.js'
import { publish, subscribe } from '../../store/subscribers.js'

const baseURL = new URL('.', import.meta.url)
let menuEl = null
let triggerElement = null

export async function mountMore(container, triggerEl) {
  if (!container || !triggerEl) return
  triggerElement = triggerEl

  // 如果已经存在，直接切换显示
  if (menuEl) {
    menuEl.classList.toggle('show')
    return
  }

  // 加载 HTML
  const html = await fetch(new URL('More.html', baseURL)).then(res => res.text())
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  menuEl = wrapper.firstElementChild

  // 加载 CSS
  loadCSS(new URL('More.css', baseURL))

  // 插入到 body
  container.appendChild(menuEl)

  // 获取固定菜单项
  const settings = menuEl.querySelector('#more-settings')
  const report = menuEl.querySelector('#more-report')
  const authItem = menuEl.querySelector('#more-auth')

  // 固定菜单事件
  settings.addEventListener('click', () => {
    alert('Open Settings')
    hide()
  })
  report.addEventListener('click', () => {
    alert('Open Report')
    hide()
  })

  // 点击 More 按钮
  triggerEl.addEventListener('click', e => {
    e.stopPropagation()
    menuEl.classList.toggle('show')
  })

  // 点击空白关闭
  document.addEventListener('click', e => {
    if (!menuEl.contains(e.target) && e.target !== triggerEl) hide()
  })

  // 初始化登录状态菜单
  updateMenuByUser(getUser())

  // 订阅用户状态变化
  subscribe(user => updateMenuByUser(user))

  // --- 内部函数 ---
  function updateMenuByUser(user) {
    authItem.textContent = user ? 'Logout' : 'Login'
    authItem.onclick = async () => {
      hide()
      if (user) {
        // 登出
        try {
          await signOut()
          clearUser()
          publish('userChange', null)
          alert('Logged out successfully')
        } catch (err) {
          console.error('Logout failed', err)
          alert('Logout failed')
        }
      } else {
        // 未登录时跳转登录弹窗或页面
        window.dispatchEvent(new CustomEvent('openLoginModal'))
      }
    }
  }
}

function hide() {
  if (menuEl) menuEl.classList.remove('show')
}

// 加载 CSS
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
