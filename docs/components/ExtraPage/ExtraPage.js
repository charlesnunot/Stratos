import { getCurrentUser, onAuthChange, signOut } from '../../store/supabase.js'

export function mountExtraPage(container) {
  import('./ExtraPage.html').then(res => {
    container.innerHTML = res.default || res
    initExtraPage()
  })
}

function initExtraPage() {
  const guestExtra = document.querySelector('.guest-extra')
  const userInfo = document.querySelector('.user-info')
  const userDataSection = document.getElementById('user-data-section')
  const userEmailEl = document.getElementById('user-email')
  const userAvatarEl = document.getElementById('user-avatar')
  const userNicknameEl = document.getElementById('user-nickname')

  function updateUserUI(user) {
    if (user) {
      guestExtra.style.display = 'none'
      userInfo.style.display = 'block'
      userDataSection.style.display = 'block'

      userEmailEl.textContent = user.email
      userAvatarEl.src = user.user_metadata?.avatar_url || 'https://via.placeholder.com/80'
      userNicknameEl.textContent = user.user_metadata?.nickname || 'Anonymous'
    } else {
      guestExtra.style.display = 'flex'
      userInfo.style.display = 'none'
      userDataSection.style.display = 'none'
    }
  }

  // 初始化当前用户状态
  getCurrentUser().then(updateUserUI)

  // 监听登录状态变化
  onAuthChange((event, session) => {
    updateUserUI(session?.user || null)
  })

  // 登出按钮
  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut()
    })
  }

  // 注册/登录点击事件
  const registerText = document.getElementById('register-text')
  if (registerText) registerText.addEventListener('click', () => openRegisterModal())
  const loginText = document.getElementById('login-text')
  if (loginText) loginText.addEventListener('click', () => openLoginModal())

  // 底部条款点击事件
  document.getElementById('terms-link')?.addEventListener('click', () => showModal('Terms'))
  document.getElementById('community-link')?.addEventListener('click', () => showModal('Community Guidelines'))
  document.getElementById('privacy-link')?.addEventListener('click', () => showModal('Privacy Policy'))
}

