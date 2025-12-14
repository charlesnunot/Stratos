import { initAuthSubscribers } from '../store/subscribers.js'
import { mountSidebar } from '../components/Sidebar/Sidebar.js'
import { mountExtraPage } from '../components/ExtraPage/ExtraPage.js'

// -----------------------------
// 1️⃣ 挂载 Sidebar（基础界面）
// -----------------------------
const sidebarContainer = document.getElementById('sidebar-root')
mountSidebar(sidebarContainer)

// -----------------------------
// 2️⃣ 挂载右侧 Extra 页面
// -----------------------------
const extraContainer = document.getElementById('extra-root')
mountExtraPage(extraContainer)

// -----------------------------
// 3️⃣ 初始化登录状态订阅
// -----------------------------
initAuthSubscribers()
