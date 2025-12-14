import { mountExtraPage, showUserInfo, hideUserInfo } from '../components/ExtraPage/ExtraPage.js';
import { initAuthSubscribers, subscribe } from '../store/subscribers.js';
import { mountSidebar } from '../components/Sidebar/Sidebar.js';

// 1️⃣ 挂载 Sidebar
mountSidebar(document.getElementById('sidebar-root'));

// 2️⃣ 挂载 ExtraPage
mountExtraPage(document.getElementById('extra-root'));

// 3️⃣ 初始化登录状态订阅
initAuthSubscribers();

// 4️⃣ 根据用户状态显示不同内容
subscribe('userChange', user => {
  if (user) {
    showUserInfo(user);  // 用户已登录，显示信息区
  } else {
    hideUserInfo();      // 用户未登录，移除信息区
  }
});
