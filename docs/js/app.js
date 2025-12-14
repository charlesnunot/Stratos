// /docs/js/app.js
import { initAuthSubscribers, subscribe } from '../store/subscribers.js'
import { mountSidebar } from '../components/Sidebar/Sidebar.js';

// -----------------------------
// 1️⃣ 初始化登录状态订阅
// -----------------------------
initAuthSubscribers()

// -----------------------------
// 2️⃣ 订阅用户状态变化，自动更新 UI
// -----------------------------
subscribe('userChange', user => {
  if (user) {
    console.log('用户已登录:', user)
    // 渲染 Sidebar 或者其他用户相关 UI
    mountSidebar(document.getElementById('sidebar-root'))
  } else {
    console.log('用户未登录')
    // 用户未登录显示默认 / 游客界面
    document.getElementById('sidebar-root').innerHTML = '<p>请登录</p>'
  }
})










mountSidebar(document.getElementById('sidebar-root'));
