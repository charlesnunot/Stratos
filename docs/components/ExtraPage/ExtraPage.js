// docs/components/ExtraPage/ExtraPage.js
import { AuthModal } from '../AuthModal/AuthModal.js'
import { subscribe as subscribeUserChange } from '../../store/subscribers.js'

const baseURL = new URL('.', import.meta.url)

/**
 * 挂载 ExtraPage
 */
export async function mountExtraPage(container) {
  if (!container) return

  const html = await fetch(new URL('ExtraPage.html', baseURL)).then(res => res.text())
  container.innerHTML = html

  loadCSS(new URL('ExtraPage.css', baseURL))
  initExtraPageEvents()
  initUserSubscription()
}

/**
 * 事件绑定
 */
function initExtraPageEvents() {
  document.getElementById('register-text')?.addEventListener(
    'click',
    () => AuthModal.open('register')
  )

  document.getElementById('login-text')?.addEventListener(
    'click',
    () => AuthModal.open('login')
  )

  document.querySelectorAll('.policy-link').forEach(el => {
    el.addEventListener('click', () => {
      alert(`显示弹窗: ${el.dataset.policy}`)
    })
  })

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    const { signOut } = await import('../../store/supabase.js')
    await signOut()
  })
}

/**
 * 订阅用户变化
 */
function initUserSubscription() {
  subscribeUserChange(user => {
    if (user) {
      showUserInfo(user)
    } else {
      hideUserInfo()
    }
  })
}

/**
 * 显示用户信息
 */
export async function showUserInfo(user) {
  const guestExtra = document.querySelector('#extra-page .guest-extra')
  const userDataSection = document.getElementById('user-data-section')

  if (!user) return

  guestExtra.style.display = 'none'
  userDataSection.style.display = 'block'

  // Avatar
  const avatarEl = userDataSection.querySelector('.avatar')
  avatarEl.src = user.avatar_url
  avatarEl.style.cursor = 'pointer'

  // 点击头像跳转 Profile 页面
  avatarEl.addEventListener('click', async () => {
    const { loadMainPage, updateActiveNav } = await import('../../components/Sidebar/Sidebar.js')
    loadMainPage('profile')
    updateActiveNav('profile')
  })

  // Profile 显示昵称/角色/简介
  const profile = user.profile || {}
  const nicknameEl = userDataSection.querySelector('.nickname')
  const roleEl = userDataSection.querySelector('.role')
  const bioEl = userDataSection.querySelector('.bio')

  nicknameEl.textContent = profile.nickname || ''
  nicknameEl.style.cursor = 'pointer'
  // 点击昵称也跳转 Profile
  nicknameEl.addEventListener('click', async () => {
    const { loadMainPage, updateActiveNav } = await import('../../components/Sidebar/Sidebar.js')
    loadMainPage('profile')
    updateActiveNav('profile')
  })

  roleEl.textContent = profile.role ? `Role: ${profile.role}` : ''
  bioEl.textContent = profile.bio || ''

  // Stats
  const stats = user.stats || {}
  userDataSection.querySelector('.followers-count').textContent = stats.followers_count ?? 0
  userDataSection.querySelector('.following-count').textContent = stats.following_count ?? 0
  userDataSection.querySelector('.likes-count').textContent = stats.likes_count ?? 0
}

/**
 * 隐藏用户信息
 */
export function hideUserInfo() {
  document.querySelector('#extra-page .guest-extra').style.display = 'flex'
  document.getElementById('user-data-section').style.display = 'none'
}

/**
 * 动态加载 CSS
 */
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
