// docs/components/Messages/Messages.js
const baseURL = new URL('.', import.meta.url);

export async function mountMessages(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Messages.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Messages.css', baseURL));

  // 获取元素
  const tabSystem = container.querySelector('#tab-system');
  const tabDynamic = container.querySelector('#tab-dynamic');
  const tabChat = container.querySelector('#tab-chat');
  const listArea = container.querySelector('#messages-list-area');
  const detailArea = container.querySelector('#message-detail-area');

  // 消息数据（可以改成从 API 获取）
  const messageData = {
    system: [
      { id: 1, title: 'System Update', content: 'System will restart at 3AM.' },
      { id: 2, title: 'Maintenance', content: 'Server maintenance tomorrow.' }
    ],
    dynamic: [
      { id: 3, title: 'New Follower', content: 'Alice followed you.' },
      { id: 4, title: 'Post Liked', content: 'Bob liked your post.' }
    ],
    chat: [
      { id: 5, title: 'Alice', content: 'Hi, how are you?' },
      { id: 6, title: 'Bob', content: 'Are you free tomorrow?' }
    ]
  };

  // 当前 tab
  let currentTab = 'system';

  // 默认加载 System 消息
  loadMessageList(currentTab);

  // Tab 切换事件
  tabSystem.addEventListener('click', () => switchTab('system'));
  tabDynamic.addEventListener('click', () => switchTab('dynamic'));
  tabChat.addEventListener('click', () => switchTab('chat'));

  function switchTab(type) {
    if (currentTab === type) return;
    currentTab = type;

    tabSystem.classList.toggle('active', type === 'system');
    tabDynamic.classList.toggle('active', type === 'dynamic');
    tabChat.classList.toggle('active', type === 'chat');

    loadMessageList(type);
  }

  function loadMessageList(type) {
    listArea.innerHTML = ''; // 清空列表

    const messages = messageData[type] || [];

    if (messages.length === 0) {
      listArea.innerHTML = '<p>No messages.</p>';
      detailArea.innerHTML = '<p>Select a message to view details.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';

    messages.forEach((msg, index) => {
      const li = document.createElement('li');
      li.textContent = msg.title;
      li.style.padding = '8px';
      li.style.borderBottom = '1px solid #eee';
      li.style.cursor = 'pointer';

      // 点击显示详情
      li.addEventListener('click', () => {
        showMessageDetail(msg);
        // 高亮选中
        const siblings = ul.querySelectorAll('li');
        siblings.forEach(s => s.style.backgroundColor = '');
        li.style.backgroundColor = '#e0f0ff';
      });

      ul.appendChild(li);

      // 默认选中第一条
      if (index === 0) {
        li.style.backgroundColor = '#e0f0ff';
        showMessageDetail(msg);
      }
    });

    listArea.appendChild(ul);
  }

  function showMessageDetail(msg) {
    detailArea.innerHTML = `
      <h3>${msg.title}</h3>
      <p>${msg.content}</p>
    `;
  }
}

// 加载 CSS
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
