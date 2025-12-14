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

  // -------------------------
  // 右侧 Extra 面板
  // -------------------------
  if (user) {
    extraContainer.innerHTML = `
      <p>欢迎回来，${user.email}</p>
      <!-- 可显示用户相关操作按钮 -->
    `
  } else {
    extraContainer.innerHTML = `
      <div class="guest-extra">
        <p>当前用户未登录</p>
        <button id="register-btn">注册</button>
        <button id="login-extra-btn">登录</button>
      </div>
    `

    const loginExtraBtn = document.getElementById('login-extra-btn')
    if (loginExtraBtn) {
      loginExtraBtn.addEventListener('click', () => openLoginModal())
    }
    const registerBtn = document.getElementById('register-btn')
    if (registerBtn) {
      registerBtn.addEventListener('click', () => openRegisterModal())
    }
  }
})
