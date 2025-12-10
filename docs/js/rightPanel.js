// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser } from './userManager.js';
import { subscribeWebMonitor } from './subscribeWebMonitor.js';
import { performLogout } from './logout.js';

/* ----------------------------
   Cloudinary 上传头像
----------------------------- */
async function uploadAvatarWeb(file, onProgress) {
  const cloudName = 'dpgkgtb5n';
  const uploadPreset = 'rn_unsigned';

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      const result = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(result.secure_url);
      } else {
        console.error("Cloudinary 上传失败:", result);
        resolve(null);
      }
    };

    xhr.onerror = () => {
      console.error("Cloudinary 上传错误");
      resolve(null);
    };

    xhr.send(formData);
  });
}

/** 更新用户头像 (Supabase user_avatars 表) */
async function updateUserAvatar(uid, avatarUrl) {
  const { error } = await supabase
    .from("user_avatars")
    .upsert(
      {
        uid: uid,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      },
      { onConflict: "uid" }
    );

  if (error) console.error("用户头像更新失败:", error);
}

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
    avatarFile.value = "";
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
      return;
    }

    await updateUserAvatar(user.uid, avatarUrl);
    avatarImg.src = avatarUrl;
    console.log("头像上传完成:", avatarUrl);
  });

  /* ----------------------------
    订阅 App 在线状态 (Web 端)
----------------------------- */
const unsubscribeWebMonitor = subscribeWebMonitor(user.uid, (data) => {
  console.log("收到 web_monitor 更新:", data);
  if (!data) return;

  // 1️⃣ 如果是 app 设备，更新 App 在线状态
  if (data.device === "app") {
    appStatusText.textContent = `APP: ${data.status}`;
    appStatusDot.style.backgroundColor = data.status === "online" ? "#2ecc71" : "#888";
  }

  // 2️⃣ 如果是 web 设备且 status 为 offline，执行退出登录
  if (data.device === "web" && data.status === "offline") {
    console.log("检测到 web 端已登录，本端需要退出");
    performLogout([unsubscribeWebMonitor]);
  }
});

  // ----------------------------
  // 绑定退出按钮
  // ----------------------------
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    // 将需要取消的订阅通道传入 performLogout
    await performLogout([/* 如果有其他通道，可以加入这里 */]);
  });

  // 页面卸载时取消订阅
  window.addEventListener("beforeunload", () => {
    unsubscribeWebMonitor();
  });
}
