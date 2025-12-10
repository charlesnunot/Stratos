// js/editNickname.js
import { supabase } from './userService.js';
import { getUser, setUser } from './userManager.js';

/**
 * 初始化昵称编辑弹窗
 * @param {Object} user - 当前用户对象 { uid, nickname, avatarUrl }
 */
export function initEditNickname(user) {
  if (!user) return;

  // 获取或创建弹窗容器
  let modal = document.getElementById('edit-nickname-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-nickname-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'none';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#fff; padding:20px; border-radius:10px; width:300px; display:flex; flex-direction:column; align-items:center; gap:10px;">
      <img src="${user.avatarUrl}" alt="Avatar" style="width:60px; height:60px; border-radius:50%;">
      <h3>Edit Nickname</h3>
      <input type="text" id="nickname-input" value="${user.nickname}" style="width:100%; padding:8px; border-radius:5px; border:1px solid #ccc;">
      <p style="font-size:12px; color:#666; text-align:center;">
        Please avoid excessive capitalization, punctuation, symbols, or random words in your nickname.
      </p>
      <button id="nickname-confirm-btn" style="padding:8px 12px; border:none; border-radius:5px; background-color:#2ecc71; color:#fff; cursor:pointer;">
        Confirm
      </button>
    </div>
  `;

  const inputEl = modal.querySelector('#nickname-input');
  const confirmBtn = modal.querySelector('#nickname-confirm-btn');

  // 点击弹窗外部关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // 点击昵称触发显示弹窗
  const usernameEl = document.getElementById('username');
  usernameEl?.addEventListener('click', () => {
    inputEl.value = user.nickname; // 每次打开刷新值
    modal.style.display = 'flex';
  });

  // 点击确认按钮
  confirmBtn.addEventListener('click', async () => {
    const newNickname = inputEl.value.trim();
    if (!newNickname) {
      alert('Nickname cannot be empty');
      return;
    }

    try {
      // 更新 Supabase 用户资料
      const { error } = await supabase
        .from('user_profiles')
        .upsert({ uid: user.uid, nickname: newNickname }, { onConflict: 'uid' });
      if (error) throw error;

      // 更新全局用户
      user.nickname = newNickname;
      setUser(user);

      // 更新右侧显示昵称
      if (usernameEl) usernameEl.textContent = newNickname;

      modal.style.display = 'none';
      console.log('Nickname updated:', newNickname);
    } catch (err) {
      alert('Failed to update nickname: ' + err.message);
      console.error(err);
    }
  });
}

