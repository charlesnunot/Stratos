// js/systemMessages.js
import { supabase, getSystemMessagesByUser } from './userService.js';

/**
 * 加载最新一条未读系统消息
 * @param {string} mountId - 挂载点 ID
 * @param {string} uid - 用户 ID
 */
export async function loadSystemMessages(mountId, uid) {
  const mountEl = document.getElementById(mountId);
  if (!mountEl) return;

  // 1️⃣ 加载 HTML 模板
  const res = await fetch('components/system-messages.html');
  if (!res.ok) return console.error('Failed to load system messages HTML');
  const html = await res.text();
  mountEl.innerHTML = html;

  // 2️⃣ 初始化消息逻辑
  initSystemMessages(uid, mountEl);
}

/**
 * 初始化系统消息渲染和点击逻辑
 * @param {string} uid
 * @param {HTMLElement} mountEl
 */
async function initSystemMessages(uid, mountEl) {
  if (!uid) return;

  const listEl = mountEl.querySelector('#messages-list');
  const markAllBtn = mountEl.querySelector('#mark-all-read-btn');
  if (!listEl || !markAllBtn) return;

  try {
    // 1️⃣ 获取系统消息
    const messages = await getSystemMessagesByUser(uid);

    // 2️⃣ 过滤出未读消息
    const unreadMessages = messages.filter(msg => {
      const readRecords = msg.system_message_reads || [];
      return !readRecords.find(r => r.user_id === uid);
    });

    if (unreadMessages.length === 0) {
      listEl.innerHTML = `<p class="no-messages">No new system messages</p>`;
      return;
    }

    // 3️⃣ 按时间排序，取最新一条
    unreadMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = unreadMessages[0];

    // 4️⃣ 渲染最新未读消息
    const item = document.createElement('div');
    item.className = 'system-message unread';
    item.innerHTML = `
      <p class="msg-text">${latest.title}</p>
      <span class="msg-time">${new Date(latest.created_at).toLocaleString()}</span>
    `;
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      window.location.href = `system-message.html?id=${latest.id}`;
    });

    listEl.innerHTML = '';
    listEl.appendChild(item);

    // 5️⃣ 标记全部已读按钮
    markAllBtn.addEventListener('click', async () => {
      for (const msg of messages) {
        await markMessageAsRead(uid, msg.id);
      }
      item.classList.remove('unread');
      item.classList.add('read');
    });
  } catch (err) {
    console.error('加载系统消息失败:', err);
    listEl.innerHTML = `<p class="error">Failed to load system messages</p>`;
  }
}

/**
 * 标记系统消息已读
 * @param {string} uid
 * @param {string} messageId
 */
async function markMessageAsRead(uid, messageId) {
  if (!uid || !messageId) return;

  const { error } = await supabase
    .from('system_message_reads')
    .upsert(
      { user_id: uid, message_id: messageId, read_at: new Date().toISOString() },
      { onConflict: ['user_id', 'message_id'] }
    );

  if (error) console.error('Failed to mark message as read:', error);
}
