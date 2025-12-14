import { mountSidebar } from '../components/Sidebar/Sidebar.js';
import { mountExtraPage, showUserInfo, hideUserInfo } from '../components/ExtraPage/ExtraPage.js';
import { initAuthSubscribers, subscribe } from '../store/subscribers.js';

// -----------------------------
// 1️⃣ 挂载 Sidebar（左侧栏）
// -----------------------------
const sidebarContainer = document.getElementById('sidebar-root');
mountSidebar(sidebarContainer);  // 必须执行，无论登录与否

// -----------------------------
// 2️⃣ 挂载 ExtraPage（右侧额外区）
// -----------------------------
const extraContainer = document.getElementById('extra-root');
mountExtraPage(extraContainer);

// -----------------------------
// 3️⃣ 初始化登录状态订阅
// -----------------------------
initAuthSubscribers();

// -----------------------------
// 4️⃣ 根据用户状态显示不同内容
// -----------------------------
subscribe('userChange', user => {
  if (user) {
    showUserInfo(user);  // 用户已登录，显示信息区和用户数据区
  } else {
    hideUserInfo();      // 用户未登录，显示注册/登录区，隐藏用户数据区
  }
});
