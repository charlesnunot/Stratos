import { mountExtraPage, showUserInfo, hideUserInfo } from '../components/ExtraPage/ExtraPage.js';
import { initAuthSubscribers, subscribe } from '../store/subscribers.js';
import { mountSidebar } from '../components/Sidebar/Sidebar.js';

// 1️⃣ 挂载 Sidebar
mountSidebar(document.getElementById('sidebar-root'));

// 2️⃣ 挂载 ExtraPage
mountExtraPage(document.getElementById('extra-root'));

// 3️⃣ 初始化登录状态订阅
initAuthSubscribers();

// 4️⃣ 用户状态变化处理
subscribe('userChange', user => {
  if (user) showUserInfo(user);
  else hideUserInfo();
});
