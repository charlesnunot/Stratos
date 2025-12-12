// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, setUser } from './userManager.js';
import { subscribeWebMonitor } from './subscribeWebMonitor.js';
import { subscribeUserAvatar } from './subscribeUserAvatar.js';
import { performLogout } from './logout.js';
import { initEditNickname } from './editNickname.js';
import { subscribeUserProfile } from './userProfileSubscriber.js';

export async function initRightPanel() {
  const avatarClick = document.getElementById("avatar-click-area");
  const avatarFile = document.getElementById("avatar-file");
  const avatarImg = document.getElementById("user-avatar");

  const usernameEl = document.getElementById("username");
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

    const avatarUrl = await uploadAvatarWeb(file);
    if (!avatarUrl) {
      alert("头像上传失败");
      avatarFile.value = "";
      return;
    }

    await updateUserAvatar(user.uid, avatarUrl);
    avatarImg.src = avatarUrl;

    avatarFile.value = "";
  });

  /* ----------------------------
      订阅 Web/App 在线状态
  ----------------------------- */
  const unsubscribeWebMonitor = subscribeWebMonitor(user.uid, (data) => {
    if (!data) return;

    if (data.device === "app") {
      appStatusText.textContent = `APP: ${data.status}`;
      appStatusDot.style.backgroundColor =
        data.status === "online" ? "#2ecc71" : "#888";
    }

    if (data.device === "web" && data.status === "offline") {
      performLogout([unsubscribeWebMonitor, unsubscribeAvatar, unsubscribeProfile]);
    }
  });

  /* ----------------------------
      订阅用户头像变化
  ----------------------------- */
  const unsubscribeAvatar = subscribeUserAvatar(user.uid, (newUrl) => {
    if (avatarImg) avatarImg.src = newUrl;
  });

  /* ----------------------------
      订阅用户资料变化（昵称、头像等）
  ----------------------------- */
  const unsubscribeProfile = subscribeUserProfile(user.uid, (profile) => {
    if (profile.nickname && usernameEl) {
      usernameEl.textContent = profile.nickname;
      const u = getUser();
      setUser({ ...u, nickname: profile.nickname });
    }

    if (profile.avatar && avatarImg) {
      avatarImg.src = profile.avatar;
      const u = getUser();
      setUser({ ...u, avatarUrl: profile.avatar });
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

  window.addEventListener("beforeunload", () => {
    unsubscribeWebMonitor();
    unsubscribeAvatar();
    unsubscribeProfile();
  });
}
