// js/systemMessages.js

import { getSystemMessagesByUser } from './userService.js';

/**
 * 加载最新一条未读系统消息并更新未读数量徽章
 * @param {string} mountId - 挂载点 ID
 * @param {string} uid - 用户 ID
 */
export async function loadSystemMessages(mountId, uid) {
  const mountEl = document.getElementById(mountId);
  if (!mountEl || !uid) return;

  try {
    const messages = await getSystemMessagesByUser(uid);

    // 过滤未读消息
    const unreadMessages = messages.filter(msg => {
      const readRecords = msg.system_message_reads || [];
      return !readRecords.find(r => r.user_id === uid);
    });

    const unreadCount = unreadMessages.length;

    // 清空挂载点
    mountEl.innerHTML = '';

    // 创建系统消息容器
    const container = document.createElement('div');
    container.className = 'system-messages';
    container.innerHTML = `
      <div class="header">
        <h3>System Notifications</h3>
        <span class="unread-badge">${unreadCount}</span>
      </div>
      <div class="messages-list"></div>
      <button id="mark-all-read-btn">Mark All Read</button>
    `;
    mountEl.appendChild(container);

    const messagesListEl = container.querySelector('.messages-list');
    const badgeEl = container.querySelector('.unread-badge');

    if (unreadCount === 0) {
      messagesListEl.innerHTML = `<p class="no-messages">No new system messages</p>`;
      return;
    }

    // 找到最新未读消息
    unreadMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = unreadMessages[0];

    // 渲染最新消息（标题 + 日期）
    const item = document.createElement('div');
    item.className = 'system-message latest-unread';
    item.innerHTML = `
      <span class="msg-title">${latest.title}</span>
      <span class="msg-time">${new Date(latest.created_at).toLocaleString()}</span>
    `;
    item.addEventListener('click', () => {
      window.location.href = `system-message.html?id=${latest.id}`;
    });

    messagesListEl.appendChild(item);

    // 绑定“Mark All Read”按钮
    const markAllBtn = container.querySelector('#mark-all-read-btn');
    markAllBtn.addEventListener('click', () => {
      // 这里你可以调用接口标记所有消息为已读，然后刷新
      unreadMessages.forEach(msg => {
        // TODO: 调用接口标记为已读
      });
      loadSystemMessages(mountId, uid);
    });

  } catch (err) {
    console.error('加载系统消息失败:', err);
    mountEl.innerHTML = `<p class="error">Failed to load system messages</p>`;
  }
}
