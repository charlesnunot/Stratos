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
  const editProfileBtn = document.getElementById("edit-profile-btn");
  const appStatusText = document.getElementById("app-status-text");
  const appStatusDot = document.getElementById("app-status-dot");
  const logoutBtn = document.getElementById("logout-btn");

  const user = getUser();
  if (!user || !user.uid) return;

  // 点击头像或昵称 → user.html
  [avatarArea, usernameEl].forEach(el => {
    el?.addEventListener("click", () => window.location.href = "user.html");
  });

  // Web/App 在线状态订阅
  const unsubscribeWebMonitor = subscribeWebMonitor(user.uid, (data) => {
    if (!data) return;
    if (data.device === "app") {
      appStatusText.textContent = `App: ${data.status}`;
      appStatusDot.style.backgroundColor = data.status === "online" ? "#2ecc71" : "#888";
    }
    if (data.device === "web" && data.status === "offline") {
      performLogout([unsubscribeWebMonitor, unsubscribeAvatar, unsubscribeProfile]);
    }
  });

  // 用户头像订阅
  const unsubscribeAvatar = subscribeUserAvatar(user.uid, (newUrl) => {
    if (avatarImg) avatarImg.src = newUrl;
  });

  // 用户资料订阅（昵称、头像）
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
  logoutBtn?.addEventListener("click", async () => {
    await performLogout([unsubscribeWebMonitor, unsubscribeAvatar, unsubscribeProfile]);
  });

  // 页面卸载时取消订阅
  window.addEventListener("beforeunload", () => {
    unsubscribeWebMonitor();
    unsubscribeAvatar();
    unsubscribeProfile();
  });
}
