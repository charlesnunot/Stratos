// docs/components/Messages/Messages.js
import { subscribe, getUser } from '../../store/userManager.js'
import {
  getSystemMessages
} from '../../store/systemMessageStore.js'

const baseURL = new URL('.', import.meta.url)

export async function mountMessages(container) {
  if (!container) return

  // 加载 HTML
  const html = await fetch(new URL('Messages.html', baseURL)).then(res => res.text())
  container.innerHTML = html

  // 加载 CSS
  loadCSS(new URL('Messages.css', baseURL))

  // DOM
  const tabSystem = container.querySelector('#tab-system')
  const tabDynamic = container.querySelector('#tab-dynamic')
  const tabChat = container.querySelector('#tab-chat')
  const listArea = container.querySelector('#messages-list-area')
  const detailArea = container.querySelector('#message-detail-area')

  const leftPanel = container.querySelector('.messages-left')
  const rightPanel = container.querySelector('.messages-right')

  let currentTab = 'system'

  // 订阅用户状态
  subscribe(user => {
    if (user) {
      enableTabs()
      loadMessages()
    } else {
      loadGuestView()
    }
  })

  // 初始化
  if (getUser()) {
    enableTabs()
    loadMessages()
  } else {
    loadGuestView()
  }

  // Tab 切换
  tabSystem.addEventListener('click', () => switchTab('system'))
  tabDynamic.addEventListener('click', () => switchTab('dynamic'))
  tabChat.addEventListener('click', () => switchTab('chat'))

  function switchTab(type) {
    if (currentTab === type) return
    currentTab = type

    tabSystem.classList.toggle('active', type === 'system')
    tabDynamic.classList.toggle('active', type === 'dynamic')
    tabChat.classList.toggle('active', type === 'chat')

    if (getUser()) {
      loadMessages()
    } else {
      loadGuestView()
    }

    // 移动端：切回列表
    if (window.innerWidth <= 768) {
      leftPanel.style.display = 'flex'
      rightPanel.style.display = 'none'
    }
  }

  // -----------------------------
  // 未登录视图
  function loadGuestView() {
    listArea.innerHTML = '<p>Please log in to view messages.</p>'
    detailArea.innerHTML = '<p>Select a message to view details.</p>'
    disableTabs()
  }

  function disableTabs() {
    tabDynamic.disabled = true
    tabChat.disabled = true
  }

  function enableTabs() {
    tabDynamic.disabled = false
    tabChat.disabled = false
  }

  // -----------------------------
  // 已登录消息加载
  function loadMessages() {
    if (currentTab === 'chat') {
      listArea.innerHTML = '<p>Chat messages coming soon.</p>'
      detailArea.innerHTML = '<p>Select a conversation.</p>'
      return
    }

    const messages = getSystemMessages(currentTab) || []
    loadMessageList(messages)
  }

  // -----------------------------
  // 消息列表
  function loadMessageList(messages) {
    listArea.innerHTML = ''
    detailArea.innerHTML = '<p>Select a message to view details.</p>'

    if (!messages.length) {
      listArea.innerHTML = '<p>No messages.</p>'
      return
    }

    const ul = document.createElement('ul')
    ul.style.listStyle = 'none'
    ul.style.padding = '0'
    ul.style.margin = '0'

    messages.forEach((msg, index) => {
      const li = document.createElement('li')
      li.textContent = msg.title
      li.style.padding = '10px'
      li.style.borderBottom = '1px solid #eee'
      li.style.cursor = 'pointer'

      li.addEventListener('click', () => {
        ul.querySelectorAll('li').forEach(n => (n.style.backgroundColor = ''))
        li.style.backgroundColor = '#e0f0ff'
        showMessageDetail(msg)
      })

      ul.appendChild(li)

      // 默认选中第一条
      if (index === 0) {
        li.style.backgroundColor = '#e0f0ff'
        showMessageDetail(msg)
      }
    })

    listArea.appendChild(ul)
  }

  // -----------------------------
  // 消息详情
  function showMessageDetail(msg) {
    const isMobile = window.innerWidth <= 768

    if (isMobile) {
      leftPanel.style.display = 'none'
      rightPanel.style.display = 'block'
    }

    detailArea.innerHTML = `
      ${isMobile ? '<button id="back-to-list">&lt; Back</button>' : ''}
      <h3>${msg.title}</h3>
      <p>${msg.content}</p>
    `

    if (isMobile) {
      detailArea.querySelector('#back-to-list')
        .addEventListener('click', () => {
          leftPanel.style.display = 'flex'
          rightPanel.style.display = 'none'
        })
    }
  }
}

// -----------------------------
// CSS Loader
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
