// js/systemMessages.js
import { supabase, getSystemMessagesByUser } from './userService.js';

/**
 * 加载最新一条未读系统消息（仅标题 + 日期）
 * @param {string} mountId - 挂载点 ID
 * @param {string} uid - 用户 ID
 */
export async function loadSystemMessages(mountId, uid) {
  const mountEl = document.getElementById(mountId);
  if (!mountEl) return;

  // 1️⃣ 清空挂载点
  mountEl.innerHTML = '';

  if (!uid) return;

  try {
    // 2️⃣ 获取系统消息
    const messages = await getSystemMessagesByUser(uid);

    // 3️⃣ 过滤未读消息
    const unreadMessages = messages.filter(msg => {
      const readRecords = msg.system_message_reads || [];
      return !readRecords.find(r => r.user_id === uid);
    });

    if (unreadMessages.length === 0) {
      mountEl.innerHTML = `<p class="no-messages">No new system messages</p>`;
      return;
    }

    // 4️⃣ 找到最新的一条未读消息
    unreadMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = unreadMessages[0];

    // 5️⃣ 渲染最新消息（仅标题 + 日期）
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

    mountEl.appendChild(item);

  } catch (err) {
    console.error('加载系统消息失败:', err);
    mountEl.innerHTML = `<p class="error">Failed to load system messages</p>`;
  }
}
