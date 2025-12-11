// js/systemMessages.js
import { supabase, getSystemMessagesByUser } from './userService.js';

/**
 * 加载系统消息到指定挂载点
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
 * 初始化系统消息渲染和点击标记已读逻辑
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

    // 2️⃣ 渲染消息
    renderMessages(listEl, messages, uid);

    // 3️⃣ 全部标记已读
    markAllBtn.addEventListener('click', async () => {
      for (const msg of messages) {
        await markMessageAsRead(uid, msg.id);
      }
      // 更新样式
      listEl.querySelectorAll('.system-message.unread').forEach(el => {
        el.classList.remove('unread');
        el.classList.add('read');
      });
    });
  } catch (err) {
    console.error('加载系统消息失败:', err);
    listEl.innerHTML = `<p class="error">Failed to load system messages</p>`;
  }
}

/**
 * 渲染消息列表
 * @param {HTMLElement} listEl
 * @param {Array} messages
 * @param {string} uid
 */
function renderMessages(listEl, messages, uid) {
  listEl.innerHTML = '';

  if (!messages || messages.length === 0) {
    listEl.innerHTML = `<p class="no-messages">No system messages</p>`;
    return;
  }

  messages.forEach(msg => {
    const readRecords = msg.system_message_reads || [];
    const isRead = !!readRecords.find(r => r.user_id === uid);

    const item = document.createElement('div');
    item.className = `system-message ${isRead ? 'read' : 'unread'}`;
    item.innerHTML = `
      <p class="msg-text">${msg.title || 'System Message'}: ${msg.content || ''}</p>
      <span class="msg-time">${new Date(msg.created_at).toLocaleString()}</span>
      ${isRead ? '' : '<button class="mark-read-btn">Mark Read</button>'}
    `;

    // 点击标记单条已读
    const markBtn = item.querySelector('.mark-read-btn');
    if (markBtn) {
      markBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await markMessageAsRead(uid, msg.id);
        item.classList.remove('unread');
        item.classList.add('read');
        markBtn.remove();
      });
    }

    listEl.appendChild(item);
  });
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

  if (error) throw error;
}
