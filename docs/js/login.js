import { supabase, getUserProfile, upsertUserProfile, getUserAvatar } from './userService.js';
import { setUser } from './userManager.js';
import { initRightPanel } from './rightPanel.js';
import { updateWebStatus, getAppStatusAndUpdateUI } from './webMonitorService.js';

function generateDefaultNickname(email) {
  const prefix = email.split('@')[0] || 'User';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix.slice(0,5)}${randomNum}${prefix.slice(-1)}`;
}

export async function loginWithEmail(email, password) {
  const { data: sessionData, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const uid = sessionData.user.id;
  localStorage.setItem('authToken', sessionData?.access_token || '');

  // 获取用户信息
  let userProfile = await getUserProfile(uid);
  const nickname = userProfile?.nickname || generateDefaultNickname(email);
  if (!userProfile) userProfile = await upsertUserProfile({ uid, nickname });

  const avatarUrl = await getUserAvatar(uid);
  const newUser = { uid, email, nickname, avatarUrl, accessToken: sessionData?.access_token };

  setUser(newUser);

  // 登录成功后更新 web_monitor (本 web 端在线状态)
  try {
    await updateWebStatus(uid, 'online');
  } catch (e) {
    console.error('更新 Web 在线状态失败:', e);
  }

  // ✅ 主动获取 app 设备状态并更新右侧面板
  await getAppStatusAndUpdateUI(uid);


  // 初始化右侧面板并开始订阅
  try {
    await initRightPanel();
  } catch (err) {
    console.warn('initRightPanel error after login', err);
  }

  return newUser;
}
