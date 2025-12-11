import { getSystemMessagesByUser } from './userService.js';

/**
 * 加载最新一条未读系统消息并更新未读数量徽章
 * @param {string} mountId - 挂载点 ID
 * @param {string} uid - 用户 ID
 */
export async function loadSystemMessages(mountId, uid) {
  const mountEl = document.getElementById(mountId);
  if (!mountEl || !uid) return;

  const messagesListEl = mountEl.querySelector('#messages-list');
  const badgeEl = mountEl.querySelector('#unread-badge');
  if (!messagesListEl || !badgeEl) return;

  // 1️⃣ 清空消息列表
  messagesListEl.innerHTML = '';

  try {
    const messages = await getSystemMessagesByUser(uid);

    // 2️⃣ 过滤未读消息
    const unreadMessages = messages.filter(msg => {
      const readRecords = msg.system_message_reads || [];
      return !readRecords.find(r => r.user_id === uid);
    });

    // 3️⃣ 更新徽章
    badgeEl.textContent = unreadMessages.length;

    if (unreadMessages.length === 0) {
      messagesListEl.innerHTML = `<p class="no-messages">No new system messages</p>`;
      return;
    }

    // 4️⃣ 找到最新未读消息
    unreadMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = unreadMessages[0];

    // 5️⃣ 渲染最新消息（标题 + 日期）
    const item = document.createElement('div');
    item.className = 'system-message latest-unread';
    item.style.cursor = 'pointer';
    item.innerHTML = `
      <strong class="msg-title">${latest.title}</strong>
      <span class="msg-time">${new Date(latest.created_at).toLocaleString()}</span>
    `;
    item.addEventListener('click', () => {
      window.location.href = `system-message.html?id=${latest.id}`;
    });

    messagesListEl.appendChild(item);

  } catch (err) {
    console.error('加载系统消息失败:', err);
    messagesListEl.innerHTML = `<p class="error">Failed to load system messages</p>`;
    badgeEl.textContent = '0';
  }
}
