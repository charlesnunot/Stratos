// docs/components/Messages/Messages.js
import { subscribe as subscribeUser, getUser } from '../../store/userManager.js'
import {
  getSystemMessages,
  subscribeSystemMessages,
  markMessageRead
} from '../../store/systemMessageStore.js'
import { markSystemMessageRead } from '../../store/systemMessageApi.js'

const baseURL = new URL('.', import.meta.url)

export async function mountMessages(container) {
  if (!container) return

  // -----------------------------
  // Load HTML & CSS
  // -----------------------------
  const html = await fetch(new URL('Messages.html', baseURL)).then(r => r.text())
  container.innerHTML = html
  loadCSS(new URL('Messages.css', baseURL))

  // -----------------------------
  // DOM
  // -----------------------------
  const tabSystem = container.querySelector('#tab-system')
  const tabDynamic = container.querySelector('#tab-dynamic')
  const tabChat = container.querySelector('#tab-chat')

  const listArea = container.querySelector('#messages-list-area')
  const detailArea = container.querySelector('#message-detail-area')

  const leftPanel = container.querySelector('.messages-left')
  const rightPanel = container.querySelector('.messages-right')

  let currentTab = 'system'
  let unsubscribeMessages = null

  // -----------------------------
  // User subscribe
  // -----------------------------
  subscribeUser(user => {
    if (user) {
      enableTabs()
      subscribeMessages()
      renderCurrentTab()
    } else {
      cleanupMessagesSubscribe()
      loadGuestView()
    }
  })

  // Init
  if (getUser()) {
    enableTabs()
    subscribeMessages()
    renderCurrentTab()
  } else {
    loadGuestView()
  }

  // -----------------------------
  // Tab events
  // -----------------------------
  tabSystem.addEventListener('click', () => switchTab('system'))
  tabDynamic.addEventListener('click', () => switchTab('dynamic'))
  tabChat.addEventListener('click', () => switchTab('chat'))

  function switchTab(type) {
    if (currentTab === type) return
    currentTab = type

    tabSystem.classList.toggle('active', type === 'system')
    tabDynamic.classList.toggle('active', type === 'dynamic')
    tabChat.classList.toggle('active', type === 'chat')

    renderCurrentTab()

    if (window.innerWidth <= 768) {
      leftPanel.style.display = 'flex'
      rightPanel.style.display = 'none'
    }
  }

  // -----------------------------
  // Message subscribe
  // -----------------------------
  function subscribeMessages() {
    cleanupMessagesSubscribe()
    unsubscribeMessages = subscribeSystemMessages(() => {
      renderCurrentTab()
    })
  }

  function cleanupMessagesSubscribe() {
    if (unsubscribeMessages) {
      unsubscribeMessages()
      unsubscribeMessages = null
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  function renderCurrentTab() {
    if (currentTab === 'chat') {
      renderChatPlaceholder()
      return
    }

    const messages = getSystemMessages(currentTab)
    renderMessageList(messages)
  }

  function renderMessageList(messages) {
    listArea.innerHTML = ''
    detailArea.innerHTML = '<p>Select a message to view details.</p>'

    if (!messages.length) {
      listArea.innerHTML = '<p>No messages.</p>'
      return
    }

    const ul = document.createElement('ul')
    ul.style.listStyle = 'none'
    ul.style.margin = '0'
    ul.style.padding = '0'

    messages.forEach((msg, index) => {
      const li = document.createElement('li')
      li.textContent = msg.title
      li.style.padding = '10px'
      li.style.borderBottom = '1px solid #eee'
      li.style.cursor = 'pointer'
      li.style.fontWeight = msg.is_read ? 'normal' : '600'

      li.addEventListener('click', () => {
        ul.querySelectorAll('li').forEach(n => (n.style.backgroundColor = ''))
        li.style.backgroundColor = '#e0f0ff'
        showMessageDetail(msg)
      })

      ul.appendChild(li)

      if (index === 0) {
        li.style.backgroundColor = '#e0f0ff'
        showMessageDetail(msg)
      }
    })

    listArea.appendChild(ul)
  }

  // -----------------------------
  // Detail
  // -----------------------------
  async function showMessageDetail(msg) {
    const user = getUser()
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

    if (!msg.is_read && user) {
      markMessageRead(currentTab, msg.id)
      await markSystemMessageRead(user.id, msg.id)
    }

    if (isMobile) {
      detailArea
        .querySelector('#back-to-list')
        .addEventListener('click', () => {
          leftPanel.style.display = 'flex'
          rightPanel.style.display = 'none'
        })
    }
  }

  // -----------------------------
  // Guest / Tabs
  // -----------------------------
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

  function renderChatPlaceholder() {
    listArea.innerHTML = '<p>Chat messages coming soon.</p>'
    detailArea.innerHTML = '<p>Select a conversation.</p>'
  }
}

// -----------------------------
// CSS loader
// -----------------------------
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
