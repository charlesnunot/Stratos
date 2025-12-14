import { initAuthSubscribers, subscribe } from '../store/subscribers.js'
import { mountSidebar } from '../components/Sidebar/Sidebar.js'

// 初始化登录状态订阅
initAuthSubscribers()

// UI 订阅用户变化
subscribe('userChange', user => {
  const container = document.getElementById('sidebar-root')
  if (!container) return

  if (user) {
    console.log('用户已登录:', user)
    // 显示用户信息 Sidebar
    mountSidebar(container)
  } else {
    console.log('用户未登录')
    // 显示游客状态
    container.innerHTML = '<p>请登录</p>'
  }
})











mountSidebar(document.getElementById('sidebar-root'));
