// js/rightPanel.js
// js/rightPanel.js
import { supabase } from './userService.js';
import { getUser, clearUser } from './userManager.js';

let presenceChannel = null;
let webMonitorChannel = null;
let webLogoutChannel = null;

/** 生成 Tab ID */
function getTabId() {
  let id = sessionStorage.getItem("web_tab_id");
  if (!id) {
    id = "tab-" + Math.random().toString(36).slice(2);
    sessionStorage.setItem("web_tab_id", id);
  }
  return id;
}

/** 更新 web_monitor 表 */
async function updateWebMonitorDB(uid, online) {
  try {
    console.log("调用 updateWebMonitorDB:", uid, online);
    const { error } = await supabase
      .from("web_monitor")
      .upsert(
        {
          uid,
          device: "web",
          status: online ? "online" : "offline",
          last_seen: new Date().toISOString()
        },
        { onConflict: ["uid", "device"] }
      );
    if (error) console.error("web_monitor 更新失败:", error);
  } catch (err) {
    console.error("web_monitor 更新异常:", err);
  }
}

/* -------------------------------------------
   新 Cloudinary 上传 (替换原来的 Supabase 上传)
-------------------------------------------- */
async function uploadAvatarWeb(file, onProgress) {
  const cloudName = 'dpgkgtb5n';
  const uploadPreset = 'rn_unsigned';

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/upload`);

    // 上传进度
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

/** 更新用户头像 (Supabase users 表) */
async function updateUserAvatar(uid, avatarUrl) {
  const { error } = await supabase
    .from("users")
    .update({ avatar: avatarUrl })
    .eq("uid", uid);

  if (error) {
    console.error("用户头像更新失败:", error);
  }
}

/** 完整登出逻辑 */
async function performFullLogout(user) {
  const modalMask = document.getElementById('modal-mask');
  if (modalMask) modalMask.style.display = 'none';

  const remoteLogoutModal = document.getElementById('remote-logout-modal');
  if (remoteLogoutModal) remoteLogoutModal.style.display = 'none';

  // 删除本地用户信息
  clearUser();
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');

  // 移除订阅通道
  if (presenceChannel) supabase.removeChannel(presenceChannel);
  if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
  if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
  webLogoutChannel = null;

  // 更新数据库状态
  if (user && user.uid) await updateWebMonitorDB(user.uid, false);

  // 显示登录 UI
  const userInfoEl = document.getElementById("user-info");
  if (userInfoEl) userInfoEl.style.display = "none";

  const loginModal = document.getElementById("login-modal");
  const registerModal = document.getElementById("register-modal");
  if (modalMask) modalMask.style.display = "flex";
  if (loginModal) loginModal.style.display = "flex";
  if (registerModal) registerModal.style.display = "none";
}

/** 倒计时弹窗处理 */
function handleRemoteLogout(user) {
  const modalMask = document.getElementById('modal-mask');
  if (!modalMask) return performFullLogout(user);

  let logoutModal = document.getElementById('remote-logout-modal');
  if (!logoutModal) {
    logoutModal = document.createElement('div');
    logoutModal.id = 'remote-logout-modal';
    logoutModal.className = 'modal';
    logoutModal.innerHTML = `
      <p>Your account has been used on another device</p>
      <p>The Web session will log out in <span id="logout-countdown">5</span> seconds</p>
      <button id="logout-now-btn">Logout Now</button>
    `;
    modalMask.appendChild(logoutModal);
  }

  modalMask.style.display = 'flex';
  logoutModal.style.display = 'flex';

  const countdownEl = document.getElementById('logout-countdown');
  const logoutNowBtn = document.getElementById('logout-now-btn');

  let countdown = 5;
  countdownEl.textContent = countdown;

  const timer = setInterval(() => {
    countdown -= 1;
    countdownEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(timer);
      logoutModal.style.display = 'none';
      modalMask.style.display = 'none';
      performFullLogout(user);
    }
  }, 1000);

  logoutNowBtn.addEventListener('click', () => {
    clearInterval(timer);
    logoutModal.style.display = 'none';
    modalMask.style.display = 'none';
    performFullLogout(user);
  });
}

/** 初始化 RightPanel */
export async function initRightPanel() {
  const avatarClick = document.getElementById("avatar-click-area");
  const avatarFile = document.getElementById("avatar-file");
  const avatarImg = document.getElementById("user-avatar");

  console.log("initRightPanel 被调用！");
  const user = getUser();
  console.log("user 对象:", user);
  console.log("user.uid:", user?.uid);

  if (!user || !user.uid) return;

  /* ----------------------------
      头像上传功能 Web 版
  ----------------------------- */
  avatarClick.addEventListener("click", () => {
    avatarFile.click();
  });

  avatarFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("用户选中了头像文件:", file.name);

    // 本地预览
    avatarImg.src = URL.createObjectURL(file);

    // 上传到 Cloudinary
    const avatarUrl = await uploadAvatarWeb(file, (p) => {
      console.log("上传进度:", p);
    });

    if (!avatarUrl) {
      alert("头像上传失败");
      return;
    }

    // 更新 Supabase
    await updateUserAvatar(user.uid, avatarUrl);

    // 更新前端显示
    avatarImg.src = avatarUrl;

    console.log("头像上传与更新完成:", avatarUrl);
  });

  const tabId = getTabId();
  console.log("This tab id =", tabId);

  const appStatusText = document.getElementById("app-status-text");
  const appStatusDot = document.getElementById("app-status-dot");

  // 启动时更新 Web 状态为 online
  await updateWebMonitorDB(user.uid, true);

  // 获取 APP 状态
  try {
    const { data: appData, error: appError } = await supabase
      .from("web_monitor")
      .select("*")
      .eq("uid", user.uid)
      .eq("device", "app")
      .single();

    if (!appError && appData) {
      appStatusText.textContent = `APP: ${appData.status}`;
      appStatusDot.style.backgroundColor =
        appData.status === "online" ? "#2ecc71" : "#888";
    } else {
      appStatusText.textContent = "APP: offline";
      appStatusDot.style.backgroundColor = "#888";
    }
  } catch (e) {
    console.warn("获取 APP 当前状态失败:", e);
    appStatusText.textContent = "APP: offline";
    appStatusDot.style.backgroundColor = "#888";
  }

  // 订阅 APP 状态变化
  if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
  webMonitorChannel = supabase
    .channel(`web_monitor-${user.uid}`, { config: { broadcast: { self: true } } })
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "web_monitor",
        filter: `uid=eq.${user.uid},device=eq.app`
      },
      (payload) => {
        const newData = payload.new;
        if (!newData) return;
        appStatusText.textContent = `APP: ${newData.status}`;
        appStatusDot.style.backgroundColor =
          newData.status === "online" ? "#2ecc71" : "#888";
      }
    )
    .subscribe();

  // Presence 订阅
  if (presenceChannel) supabase.removeChannel(presenceChannel);
  presenceChannel = supabase.channel("web-presence", {
    config: { presence: { key: user.uid } }
  });

  await presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await presenceChannel.track({
        tab_id: tabId,
        at: new Date().toISOString()
      });
      console.log("Presence subscribed for tab:", tabId);
    }
  });

  presenceChannel.on("presence", { event: "sync" }, async () => {
    const state = presenceChannel.presenceState();
    const userEntries = state[user.uid] ?? [];
    const online = userEntries.length > 0;
    await updateWebMonitorDB(user.uid, online);
  });

  // 页面卸载 / 手动登出
  window.addEventListener("beforeunload", async () => {
    if (presenceChannel) supabase.removeChannel(presenceChannel);
    if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
    if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
    if (user && user.uid) await updateWebMonitorDB(user.uid, false);
  });

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      if (webMonitorChannel) supabase.removeChannel(webMonitorChannel);
      if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
      if (user && user.uid) await updateWebMonitorDB(user.uid, false);
      performFullLogout(user);
    });
  }

  // 远程登出订阅（App → Web）
  if (webLogoutChannel) supabase.removeChannel(webLogoutChannel);
  webLogoutChannel = supabase
    .channel(`remote-logout-${user.uid}`, { config: { broadcast: { self: true } } })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "web_monitor" },
      (payload) => {
        const row = payload.new;
        if (!row) return;

        // 仅 Web 设备的 offline 状态触发登出
        if (row.uid === user.uid && row.device === "web" && row.status === "offline") {
          handleRemoteLogout(user);
        }
      }
    )
    .subscribe((s) => {
      console.log("📡 Remote logout channel 状态:", s);
    });
}
