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

  try {
    // 1️⃣ 获取系统消息
    const messages = await getSystemMessagesByUser(uid);

    if (!messages || messages.length === 0) {
      mountEl.innerHTML = `<p class="no-messages">No system messages</p>`;
      return;
    }

    // 2️⃣ 渲染消息列表
    const listEl = document.createElement('div');
    listEl.className = 'system-messages-list';

    messages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'system-message-item';
      // 判断是否已读
      const readRecords = msg.system_message_reads || [];
      if (!readRecords.find(r => r.user_id === uid)) {
        item.classList.add('unread');
      }

      item.innerHTML = `
        <div class="msg-header">
          <span class="msg-title">${msg.title || 'System Message'}</span>
          <span class="msg-time">${new Date(msg.created_at).toLocaleString()}</span>
        </div>
        <div class="msg-body">${msg.content || ''}</div>
      `;

      // 点击标记已读
      item.addEventListener('click', async () => {
        if (!item.classList.contains('unread')) return;
        item.classList.remove('unread');
        try {
          await markMessageAsRead(uid, msg.id);
        } catch (err) {
          console.error('标记已读失败:', err);
        }
      });

      listEl.appendChild(item);
    });

    mountEl.appendChild(listEl);
  } catch (err) {
    console.error('加载系统消息失败:', err);
    mountEl.innerHTML = `<p class="error">Failed to load system messages</p>`;
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

  if (error) throw error;
}
