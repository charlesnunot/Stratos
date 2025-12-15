// docs/components/AuthModal/AuthModal.js
import { signIn, signUp } from '../../store/supabase.js'

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
        registerForm.reset()
        alert('Registration successful! Please check your email.')
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
