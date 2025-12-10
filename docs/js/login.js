import { supabase, getUserProfile, upsertUserProfile, getUserAvatar } from './userService.js';
import { setUser } from './userManager.js';
import { initRightPanel } from './rightPanel.js';

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

  // 登录成功后更新 web_monitor
  try {
    await supabase
      .from('web_monitor')
      .upsert(
        {
          uid: uid,
          device: 'web',
          status: 'online',
          last_seen: new Date().toISOString()
        },
        { onConflict: ['uid', 'device'] }
      );
  } catch (e) {
    console.error('更新 web_monitor 状态失败:', e);
  }

  // 初始化右侧面板
  try {
    await initRightPanel();
  } catch (err) {
    console.warn('initRightPanel error after login', err);
  }

  return newUser;
}

