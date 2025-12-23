// docs/components/Messages/Messages.js
import { subscribe, getUser } from '../../store/userManager.js'

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

  let currentTab = 'system';

  // 订阅用户状态变化
  subscribe(user => {
    if (user) {
      loadMessages(user);  // 已登录
    } else {
      loadGuestView();     // 未登录
    }
  });

  // 初始化
  const currentUser = getUser();
  if (currentUser) loadMessages(currentUser);
  else loadGuestView();

  // Tab 切换
  tabSystem.addEventListener('click', () => switchTab('system'));
  tabDynamic.addEventListener('click', () => switchTab('dynamic'));
  tabChat.addEventListener('click', () => switchTab('chat'));

  function switchTab(type) {
    if (currentTab === type) return;
    currentTab = type;

    tabSystem.classList.toggle('active', type === 'system');
    tabDynamic.classList.toggle('active', type === 'dynamic');
    tabChat.classList.toggle('active', type === 'chat');

    const user = getUser();
    if (user) loadMessages(user);
    else loadGuestView();

    // 移动端切换tab时确保显示列表
    if (window.innerWidth <= 768) {
      container.querySelector('.messages-left').style.display = 'flex';
      container.querySelector('.messages-right').style.display = 'none';
    }
  }

  // -----------------------------
  // 未登录视图
  function loadGuestView() {
    listArea.innerHTML = '<p>Please log in to view messages.</p>';
    detailArea.innerHTML = '<p>Select a message to view details.</p>';
    tabDynamic.disabled = true;
    tabChat.disabled = true;
  }

  // -----------------------------
  // 已登录视图
  function loadMessages(user) {
    // 示例消息数据，可改为 API 获取
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

    tabDynamic.disabled = false;
    tabChat.disabled = false;

    loadMessageList(currentTab, messageData);
  }

  function loadMessageList(type, data) {
    listArea.innerHTML = '';
    const messages = data[type] || [];

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

      li.addEventListener('click', () => {
        showMessageDetail(msg);
        ul.querySelectorAll('li').forEach(s => s.style.backgroundColor = '');
        li.style.backgroundColor = '#e0f0ff';
      });

      ul.appendChild(li);

      if (index === 0) {
        li.style.backgroundColor = '#e0f0ff';
        showMessageDetail(msg);
      }
    });

    listArea.appendChild(ul);
  }

  function showMessageDetail(msg) {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      container.querySelector('.messages-left').style.display = 'none';
      container.querySelector('.messages-right').style.display = 'block';
    }

    detailArea.innerHTML = `
      ${isMobile ? '<button id="back-to-list">&lt; Back</button>' : ''}
      <h3>${msg.title}</h3>
      <p>${msg.content}</p>
    `;

    if (isMobile) {
      const backBtn = detailArea.querySelector('#back-to-list');
      backBtn.addEventListener('click', () => {
        container.querySelector('.messages-left').style.display = 'flex';
        container.querySelector('.messages-right').style.display = 'none';
      });
    }
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
