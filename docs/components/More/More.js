// docs/components/More/More.js
import { signOut } from '../../store/supabase.js'
import { clearUser, getUser, subscribe as subscribeUser } from '../../store/userManager.js'
import { publish } from '../../store/subscribers.js'
import { AuthModal } from '../AuthModal/AuthModal.js'

const baseURL = new URL('.', import.meta.url)
let menuEl = null
let triggerElement = null

export async function mountMore(container, triggerEl) {
  if (!container || !triggerEl) return
  triggerElement = triggerEl

  // 如果菜单已存在，直接切换显示
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

  // 插入到 container
  container.appendChild(menuEl)

  // 获取菜单项
  const settings = menuEl.querySelector('#more-settings')
  const report = menuEl.querySelector('#more-report')
  const authItem = menuEl.querySelector('#more-auth')

  if (!authItem) return

  // 固定菜单事件
  settings.addEventListener('click', () => {
    alert('Open Settings')
    hide()
  })

  report.addEventListener('click', () => {
    alert('Open Report')
    hide()
  })

  // More 按钮点击
  triggerEl.addEventListener('click', e => {
    e.stopPropagation()
    menuEl.classList.toggle('show')
  })

  // 点击空白关闭菜单
  document.addEventListener('click', e => {
    if (!menuEl.contains(e.target) && e.target !== triggerEl) hide()
  })

  // -----------------------------
  // 登录状态渲染
  // -----------------------------
  function updateMenuByUser(user) {
    if (!authItem) return

    if (user) {
      authItem.textContent = 'Logout'
      authItem.onclick = async () => {
        hide()
        try {
          await signOut()
          clearUser()
          publish('userChange', null)
          alert('Logged out successfully')
        } catch (err) {
          console.error('Logout failed', err)
          alert('Logout failed')
        }
      }
    } else {
      authItem.textContent = 'Login'
      authItem.onclick = () => {
        hide()
        AuthModal.open('login')
      }
    }
  }

  // 初始状态（页面刚加载）
  updateMenuByUser(getUser())

  // ✅ 关键修复：订阅 userManager
  subscribeUser(user => {
    updateMenuByUser(user)
  })
}

// 隐藏菜单
function hide() {
  if (menuEl) menuEl.classList.remove('show')
}

// 动态加载 CSS
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
