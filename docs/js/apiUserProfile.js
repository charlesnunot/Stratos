// js/editNickname.js
import { getUser, setUser } from './userManager.js';
import { upsertUserProfile } from './apiUserProfile.js';

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
      <img src="${user.avatarUrl}" alt="Avatar" style="width:60px; height:60px; border-radius:50%; object-fit:cover;">
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
    const currentUser = getUser();
    if (currentUser) inputEl.value = currentUser.nickname;
    modal.style.display = 'flex';
  });

  // 点击确认按钮
  confirmBtn.addEventListener('click', async () => {
    const newNickname = inputEl.value.trim();
    if (!newNickname) {
      alert('Nickname cannot be empty');
      return;
    }

    const currentUser = getUser();
    if (!currentUser) return;

    try {
      // 调用 API 更新昵称
      const updatedProfile = await upsertUserProfile({
        uid: currentUser.uid,
        nickname: newNickname,
      });

      if (!updatedProfile) {
        alert('Failed to update nickname.');
        return;
      }

      // 更新本地用户信息
      currentUser.nickname = updatedProfile.nickname;
      setUser(currentUser);

      // 更新右侧显示昵称
      if (usernameEl) usernameEl.textContent = updatedProfile.nickname;

      modal.style.display = 'none';
      console.log('Nickname updated:', updatedProfile.nickname);
    } catch (err) {
      alert('Failed to update nickname: ' + err.message);
      console.error(err);
    }
  });
}
