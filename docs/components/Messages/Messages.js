const baseURL = new URL('.', import.meta.url);

export async function mountMessages(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Messages.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Messages.css', baseURL));

  const tabSystem = container.querySelector('#tab-system');
  const tabDynamic = container.querySelector('#tab-dynamic');
  const tabChat = container.querySelector('#tab-chat');
  const listArea = container.querySelector('#messages-list-area');
  const detailArea = container.querySelector('#message-detail-area');

  // 默认加载 System 消息
  loadMessageList('system');

  tabSystem.addEventListener('click', () => switchTab('system'));
  tabDynamic.addEventListener('click', () => switchTab('dynamic'));
  tabChat.addEventListener('click', () => switchTab('chat'));

  function switchTab(type) {
    tabSystem.classList.toggle('active', type === 'system');
    tabDynamic.classList.toggle('active', type === 'dynamic');
    tabChat.classList.toggle('active', type === 'chat');
    loadMessageList(type);
  }

  async function loadMessageList(type) {
    listArea.innerHTML = ''; // 清空列表

    // 模拟数据
    let messages = [];
    switch(type) {
      case 'system':
        messages = [
          { id: 1, title: 'System Update', content: 'System will restart at 3AM.' },
          { id: 2, title: 'Maintenance', content: 'Server maintenance tomorrow.' }
        ];
        break;
      case 'dynamic':
        messages = [
          { id: 3, title: 'New Follower', content: 'Alice followed you.' },
          { id: 4, title: 'Post Liked', content: 'Bob liked your post.' }
        ];
        break;
      case 'chat':
        messages = [
          { id: 5, title: 'Alice', content: 'Hi, how are you?' },
          { id: 6, title: 'Bob', content: 'Are you free tomorrow?' }
        ];
        break;
    }

    // 渲染消息列表
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    messages.forEach(msg => {
      const li = document.createElement('li');
      li.textContent = msg.title;
      li.style.padding = '8px';
      li.style.borderBottom = '1px solid #eee';
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => showMessageDetail(msg));
      ul.appendChild(li);
    });
    listArea.appendChild(ul);

    // 默认选中第一条
    if (messages[0]) showMessageDetail(messages[0]);
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
