export function initChatPanel(userPanelContainer, contentContainer) {
  // 如果已经存在聊天面板就不重复添加
  if (document.getElementById('chat-panel')) return;

  const chatPanel = document.createElement('div');
  chatPanel.id = 'chat-panel';
  chatPanel.innerHTML = `
    <h3>Chat Panel</h3>
    <p>Chat messages appear here...</p>
  `;

  chatPanel.style.flex = '0 0 25%'; // 宽度 25%
  chatPanel.style.background = '#e0f7fa';
  chatPanel.style.padding = '12px';
  chatPanel.style.marginLeft = '12px';

  // 插入在用户面板右边
  userPanelContainer.insertAdjacentElement('afterend', chatPanel);

  // 压缩主内容栏
  contentContainer.style.flex = '1';
}

