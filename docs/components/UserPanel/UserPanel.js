import { initAvatarWrapper, setAppOnline, setAppOffline } from './AvatarWrapper/AvatarWrapper.js';
import { initNickname } from './Nickname/Nickname.js';
import { initUserStats } from './UserStats/UserStats.js';
import { initUserBio } from './UserBio/UserBio.js';

export function initUserPanel() {
  const panel = document.getElementById("panel-user");
  if (!panel) return;

  // 占位容器
  panel.innerHTML = `
    <div id="avatar-container"></div>
    <div id="nickname-container"></div>
    <div id="stats-container"></div>
    <div id="bio-container"></div>
  `;

  initAvatarWrapper("avatar-container");
  initNickname("nickname-container", "Keyong");
  initUserStats("stats-container", { following: 102, followers: 230, likes: 58 });
  initUserBio("bio-container",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit...",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua..."
  );
}

// ✅ 对外导出状态点方法
export { setAppOnline, setAppOffline };
