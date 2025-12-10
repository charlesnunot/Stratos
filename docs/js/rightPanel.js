// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser } from './userManager.js';
import { subscribeWebMonitor } from './subscribeWebMonitor.js';
import { subscribeUserAvatar } from './subscribeUserAvatar.js';
import { performLogout } from './logout.js';

/** 初始化 RightPanel */
export async function initRightPanel() {
  const avatarClick = document.getElementById("avatar-click-area");
  const avatarFile = document.getElementById("avatar-file");
  const avatarImg = document.getElementById("user-avatar");

  const appStatusText = document.getElementById("app-status-text");
  const appStatusDot = document.getElementById("app-status-dot");

  const user = getUser();
  if (!user || !user.uid) return;

  /* ----------------------------
    头像上传
  ----------------------------- */
  avatarClick?.addEventListener("click", () => {
    // 直接触发文件选择弹窗，不在此清空 value
    avatarFile.click();
  });
  
  avatarFile?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    // 本地预览
    avatarImg.src = URL.createObjectURL(file);
  
    // 上传到 Cloudinary
    const avatarUrl = await uploadAvatarWeb(file, (p) => {
      console.log("上传进度:", p);
    });
  
    if (!avatarUrl) {
      alert("头像上传失败");
      // 上传失败也清空 value，方便下次选择同一文件
      avatarFile.value = "";
      return;
    }
  
    // 更新数据库头像
    await updateUserAvatar(user.uid, avatarUrl);
    avatarImg.src = avatarUrl;
    console.log("头像上传完成:", avatarUrl);
  
    // 上传完成后清空 value，以便下次选择同一文件
    avatarFile.value = "";
  });

  /* ----------------------------
      订阅 App 在线状态 (Web 端)
  ----------------------------- */
  const unsubscribeWebMonitor = subscribeWebMonitor(user.uid, (data) => {
    console.log("收到 web_monitor 更新:", data);
    if (!data) return;

    if (data.device === "app") {
      appStatusText.textContent = `APP: ${data.status}`;
      appStatusDot.style.backgroundColor = data.status === "online" ? "#2ecc71" : "#888";
    }

    if (data.device === "web" && data.status === "offline") {
      console.log("检测到 web 端已登录，本端需要退出");
      performLogout([unsubscribeWebMonitor, unsubscribeAvatar]); // 退出时取消所有订阅
    }
  });

  /* ----------------------------
      订阅用户头像变化
  ----------------------------- */
  const unsubscribeAvatar = subscribeUserAvatar(user.uid, (newUrl) => {
    if (avatarImg) avatarImg.src = newUrl;
    console.log("Web 端头像更新为:", newUrl);
  });

  /* ----------------------------
      绑定退出按钮
  ----------------------------- */
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    await performLogout([unsubscribeWebMonitor, unsubscribeAvatar]);
  });

  // 页面卸载时取消所有订阅
  window.addEventListener("beforeunload", () => {
    unsubscribeWebMonitor();
    unsubscribeAvatar();
  });
}
