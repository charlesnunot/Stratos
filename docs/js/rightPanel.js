// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, setUser } from './userManager.js';
import { subscribeWebMonitor } from './subscribeWebMonitor.js';
import { subscribeUserAvatar } from './subscribeUserAvatar.js';
import { subscribeUserProfile } from './userProfileSubscriber.js';
import { performLogout } from './logout.js';

export async function initRightPanel() {
  const avatarArea = document.getElementById("avatar-click-area");
  const avatarImg = document.getElementById("user-avatar");
  const usernameEl = document.getElementById("username");

  const appStatusText = document.getElementById("app-status-text");
  const appStatusDot = document.getElementById("app-status-dot");

  const user = getUser();
  if (!user || !user.uid) return;

  // 点击头像或昵称跳转到用户页面
  avatarArea?.addEventListener("click", () => {
    window.location.href = "user.html";
  });
  usernameEl?.addEventListener("click", () => {
    window.location.href = "user.html";
  });

  // 订阅 Web/App 在线状态
  const unsubscribeWebMonitor = subscribeWebMonitor(user.uid, (data) => {
    if (!data) return;

    if (data.device === "app") {
      appStatusText.textContent = `APP: ${data.status}`;
      appStatusDot.style.backgroundColor =
        data.status === "online" ? "#2ecc71" : "#888";
    }

    // Web 被远程下线 → 自动登出
    if (data.device === "web" && data.status === "offline") {
      performLogout([
        unsubscribeWebMonitor,
        unsubscribeAvatar,
        unsubscribeProfile,
      ]);
    }
  });

  // 订阅用户头像更新
  const unsubscribeAvatar = subscribeUserAvatar(user.uid, (newUrl) => {
    if (avatarImg) avatarImg.src = newUrl;
  });

  // 订阅用户资料变化（昵称、头像）
  const unsubscribeProfile = subscribeUserProfile(user.uid, (profile) => {
    const u = getUser();
    if (!u) return;

    if (profile.nickname && usernameEl) {
      usernameEl.textContent = profile.nickname;
      setUser({ ...u, nickname: profile.nickname });
    }

    if (profile.avatar && avatarImg) {
      avatarImg.src = profile.avatar;
      setUser({ ...u, avatarUrl: profile.avatar });
    }
  });

  // 登出按钮
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    await performLogout([
      unsubscribeWebMonitor,
      unsubscribeAvatar,
      unsubscribeProfile,
    ]);
  });

  // 页面关闭时取消订阅
  window.addEventListener("beforeunload", () => {
    unsubscribeWebMonitor();
    unsubscribeAvatar();
    unsubscribeProfile();
  });
}
