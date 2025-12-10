// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, setUser } from './userManager.js';
import { subscribeWebMonitor } from './subscribeWebMonitor.js';
import { subscribeUserAvatar } from './subscribeUserAvatar.js';
import { performLogout } from './logout.js';
import { initEditNickname } from './editNickname.js';
import { subscribeUserProfile } from './userProfileSubscriber.js';   // ⭐ 新增：订阅昵称/资料更新

/** 初始化 RightPanel */
export async function initRightPanel() {
  const avatarClick = document.getElementById("avatar-click-area");
  const avatarFile = document.getElementById("avatar-file");
  const avatarImg = document.getElementById("user-avatar");

  const usernameEl = document.getElementById("username"); // ⭐ 昵称显示位置
  const appStatusText = document.getElementById("app-status-text");
  const appStatusDot = document.getElementById("app-status-dot");

  const user = getUser();
  if (!user || !user.uid) return;

  // 初始化昵称编辑 UI
  initEditNickname(user);

  /* ----------------------------
      头像上传
  ----------------------------- */
  avatarClick?.addEventListener("click", () => {
    avatarFile.click();
  });

  avatarFile?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    avatarImg.src = URL.createObjectURL(file);

    const avatarUrl = await uploadAvatarWeb(file, (p) => {
      console.log("上传进度:", p);
    });

    if (!avatarUrl) {
      alert("头像上传失败");
      avatarFile.value = "";
      return;
    }

    await updateUserAvatar(user.uid, avatarUrl);
    avatarImg.src = avatarUrl;
    console.log("头像上传完成:", avatarUrl);

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
      appStatusDot.style.backgroundColor =
        data.status === "online" ? "#2ecc71" : "#888";
    }

    if (data.device === "web" && data.status === "offline") {
      console.log("检测到 web 端已登录，本端需要退出");
      performLogout([unsubscribeWebMonitor, unsubscribeAvatar, unsubscribeProfile]);
    }
  });

  /* ----------------------------
      订阅 用户头像变化
  ----------------------------- */
  const unsubscribeAvatar = subscribeUserAvatar(user.uid, (newUrl) => {
    if (avatarImg) avatarImg.src = newUrl;
    console.log("Web 端头像更新为:", newUrl);
  });

  /* ----------------------------
      ⭐ 订阅 用户资料变化（昵称、头像、职业…）
      自动同步更新右侧昵称，无需刷新页面
  ----------------------------- */
  const unsubscribeProfile = subscribeUserProfile(user.uid, (profile) => {
    console.log("🎉 收到用户资料更新:", profile);

    // 更新昵称显示
    if (profile.nickname && usernameEl) {
      usernameEl.textContent = profile.nickname;
      const u = getUser();
      setUser({ ...u, nickname: profile.nickname });
    }

    // 头像变化（如果你 user_profiles 有 avatar 字段）
    if (profile.avatar && avatarImg) {
      avatarImg.src = profile.avatar;
      const u = getUser();
      setUser({ ...u, avatarUrl: profile.avatarUrl });
    }
  });

  /* ----------------------------
      绑定退出按钮
  ----------------------------- */
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    await performLogout([
      unsubscribeWebMonitor,
      unsubscribeAvatar,
      unsubscribeProfile
    ]);
  });

  // 页面卸载时取消订阅
  window.addEventListener("beforeunload", () => {
    unsubscribeWebMonitor();
    unsubscribeAvatar();
    unsubscribeProfile();
  });
}
