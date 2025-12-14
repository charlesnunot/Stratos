import { initAuthSubscribers, subscribe } from '../store/subscribers.js'
import { mountSidebar } from '../components/Sidebar/Sidebar.js'

// -----------------------------
// 1️⃣ 挂载 Sidebar（基础界面）
// -----------------------------
const sidebarContainer = document.getElementById('sidebar-root')
mountSidebar(sidebarContainer)  // 必须执行，无论登录与否

// -----------------------------
// 2️⃣ 初始化登录状态订阅
// -----------------------------
initAuthSubscribers()

// -----------------------------
// 3️⃣ UI 订阅用户变化
// -----------------------------
subscribe('userChange', user => {
  const extraContainer = document.getElementById('extra-root')

  // 清空旧内容并移除动画 class
  extraContainer.classList.remove('active')

  if (user) {
    // 已登录状态
    extraContainer.innerHTML = `
      <p class="welcome-text">Welcome back, ${user.email}</p>
      <button id="logout-btn">Log out</button>
    `
    const logoutBtn = document.getElementById('logout-btn')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        const { signOut } = await import('../store/supabase.js')
        await signOut()
      })
    }
  } else {
    // 未登录状态
    extraContainer.innerHTML = `
      <div class="guest-extra">
        <p class="guest-actions">
          <span id="register-text">Register</span> / 
          <span id="login-text">Login</span>
        </p>
        <p class="guest-note">
          You are currently not logged in
        </p>
      </div>
    `
    // 注册/登录文字点击事件
    const registerText = document.getElementById('register-text')
    if (registerText) registerText.addEventListener('click', () => openRegisterModal())
    const loginText = document.getElementById('login-text')
    if (loginText) loginText.addEventListener('click', () => openLoginModal())
  }

  // 延迟加 active class 触发淡入动画
  requestAnimationFrame(() => {
    extraContainer.classList.add('active')
  })
})
