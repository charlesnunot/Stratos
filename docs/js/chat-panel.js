let chatPanel = null;

export function toggleChatPanel(userPanelContainer, contentContainer) {
  // 如果聊天面板不存在，则创建
  if (!chatPanel) {
    chatPanel = document.createElement('div');
    chatPanel.id = 'chat-panel';
    chatPanel.innerHTML = `
      <h3>Chat Panel</h3>
      <p>Chat messages appear here...</p>
    `;
    chatPanel.style.flex = '0 0 25%'; // 宽度 25%
    chatPanel.style.background = '#e0f7fa';
    chatPanel.style.padding = '12px';
    chatPanel.style.marginLeft = '12px';
    userPanelContainer.insertAdjacentElement('afterend', chatPanel);

    // 压缩主内容栏
    contentContainer.style.flex = '1';
  } else {
    // 如果存在则隐藏/显示
    if (chatPanel.style.display === 'none') {
      chatPanel.style.display = 'flex';
      contentContainer.style.flex = '1';
    } else {
      chatPanel.style.display = 'none';
      contentContainer.style.flex = '1 1 100%';
    }
  }
}
