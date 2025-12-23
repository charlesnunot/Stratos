// docs/components/AuthModal/AuthModal.js
import { signIn, signUp, getCurrentUser } from '../../store/supabase.js'
import { setUser } from '../../store/userManager.js'
import { publish } from '../../store/subscribers.js'
import { getUserProfile, getUserAvatar, getUserStats } from '../../store/api.js'

const baseURL = new URL('.', import.meta.url)

export const AuthModal = (() => {
  let modalContainer = null

  function init() {
    if (modalContainer) return

    // 加载 HTML
    fetch(new URL('AuthModal.html', baseURL))
      .then(res => res.text())
      .then(html => {
        document.body.insertAdjacentHTML('beforeend', html)
        modalContainer = document.getElementById('auth-modal')
        bindEvents()
      })

    // 加载 CSS
    loadCSS(new URL('AuthModal.css', baseURL))
  }

  function bindEvents() {
    const closeBtn = modalContainer.querySelector('.auth-close')
    const loginForm = modalContainer.querySelector('#login-form')
    const registerForm = modalContainer.querySelector('#register-form')
    const switchToRegister = modalContainer.querySelector('#switch-to-register')
    const switchToLogin = modalContainer.querySelector('#switch-to-login')

    // 关闭弹窗
    closeBtn.addEventListener('click', hide)

    // 切换注册 / 登录
    switchToRegister.addEventListener('click', () => {
      loginForm.classList.remove('active')
      registerForm.classList.add('active')
    })

    switchToLogin.addEventListener('click', () => {
      registerForm.classList.remove('active')
      loginForm.classList.add('active')
    })

    // -----------------------------
    // 登录
    // -----------------------------
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const email = loginForm.querySelector('#login-email').value.trim()
      const password = loginForm.querySelector('#login-password').value.trim()

      try {
        await signIn(email, password)
        await syncUserState()   // ✅ 关键：同步 SPA 用户状态
        loginForm.reset()
        hide()
      } catch (err) {
        alert(err.message || 'Login failed')
      }
    })

    // -----------------------------
    // 注册
    // -----------------------------
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const email = registerForm.querySelector('#register-email').value.trim()
      const password = registerForm.querySelector('#register-password').value.trim()

      try {
        await signUp(email, password)
        await syncUserState()   // ✅ 注册后同样同步
        registerForm.reset()
        alert('Registration successful!')
        hide()
      } catch (err) {
        alert(err.message || 'Register failed')
      }
    })

    // 点击遮罩关闭
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) hide()
    })

    // 密码显示 / 隐藏
    modalContainer.querySelectorAll('.toggle-password').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const input = toggle.previousElementSibling
        input.type = input.type === 'password' ? 'text' : 'password'
      })
    })
  }

  // =============================
  // 🔑 核心：登录后同步 SPA 状态
  // =============================
  async function syncUserState() {
    const authUser = await getCurrentUser()
    if (!authUser) return

    const uid = authUser.id

    const [profile, avatar, stats] = await Promise.all([
      getUserProfile(uid),
      getUserAvatar(uid),
      getUserStats(uid)
    ])

    const enhancedUser = {
      ...authUser,
      profile,
      avatar_url: avatar,
      stats
    }

    setUser(enhancedUser)
    publish('userChange', enhancedUser)
  }

  function open(type = 'login') {
    init()
    if (!modalContainer) return

    const loginForm = modalContainer.querySelector('#login-form')
    const registerForm = modalContainer.querySelector('#register-form')

    if (type === 'login') {
      loginForm.classList.add('active')
      registerForm.classList.remove('active')
    } else {
      loginForm.classList.remove('active')
      registerForm.classList.add('active')
    }

    modalContainer.style.display = 'flex'
  }

  function hide() {
    if (!modalContainer) return
    modalContainer.style.display = 'none'
  }

  function loadCSS(href) {
    const url = href.toString()
    if (document.querySelector(`link[href="${url}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
  }

  return { open, hide }
})()
