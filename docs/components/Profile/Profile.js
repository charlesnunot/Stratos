// docs/components/Profile/Profile.js
import { subscribe, getUser } from '../../store/userManager.js'
import { getUserProfile, getUserAvatar, getUserStats } from '../../store/api.js'
import { fetchUserPosts, fetchUserProductPosts } from '../../store/postApi.js'

const baseURL = new URL('.', import.meta.url)

export async function mountProfile(container) {
  if (!container) return

  // Load HTML
  const html = await fetch(new URL('Profile.html', baseURL)).then(res => res.text())
  container.innerHTML = html

  // Load CSS
  loadCSS(new URL('Profile.css', baseURL))

  // Elements
  const usernameEl = container.querySelector('#profile-username')
  const bioEl = container.querySelector('#profile-bio')
  const followersEl = container.querySelector('#profile-followers')
  const scoreEl = container.querySelector('#profile-score')
  const likesEl = container.querySelector('#profile-likes')
  const postsArea = container.querySelector('#profile-posts-area')
  const postTabs = container.querySelectorAll('.post-tab')
  const avatarEl = container.querySelector('#profile-avatar')

  // 订阅用户状态变化
  subscribe(user => {
    if (user) showProfile(user)
    else showGuest()
  })

  // 初始化
  const currentUser = getUser()
  if (currentUser) showProfile(currentUser)
  else showGuest()

  // tab 点击
  postTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      postTabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      loadPosts(tab.dataset.type, postsArea)
    })
  })

  // -----------------------------
  function showGuest() {
    usernameEl.textContent = 'Guest'
    bioEl.textContent = 'Please log in to view your profile.'
    followersEl.textContent = ''
    scoreEl.textContent = ''
    likesEl.textContent = ''
    avatarEl.src = 'https://via.placeholder.com/100'
    postsArea.innerHTML = '<p>Please log in to see posts and collections.</p>'
    postTabs.forEach(t => t.classList.remove('active'))
  }

  async function showProfile(user) {
    const profile = user.profile || {}
    const stats = user.stats || {}
    avatarEl.src = user.avatar_url || 'https://via.placeholder.com/100'
    usernameEl.textContent = profile.nickname || user.email || 'User'
    bioEl.textContent = profile.bio || ''
    followersEl.textContent = `Followers: ${stats.followers_count || 0}`
    scoreEl.textContent = `Score: ${stats.score || 0}`
    likesEl.textContent = `Likes: ${stats.likes_count || 0}`
    // 默认加载 posts
    postTabs.forEach(t => t.classList.remove('active'))
    const defaultTab = container.querySelector('.post-tab[data-type="posts"]')
    if (defaultTab) {
      defaultTab.classList.add('active')
      loadPosts('posts', postsArea)
    }
  }

  function loadCSS(href) {
    const url = href.toString()
    if (document.querySelector(`link[href="${url}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
  }
}

// -----------------------------
// 加载帖子
async function loadPosts(type, container) {
  container.innerHTML = '<p>Loading...</p>'
  const user = getUser()
  if (!user) {
    container.innerHTML = '<p>Please log in to see posts.</p>'
    return
  }

  let items = []

  try {
    switch(type) {
      case 'posts': {
        const posts = await fetchUserPosts(user.id)
        items = posts.map(p => `${p.content || 'No content'}`)
        break
      }
      case 'products': {
        const products = await fetchUserProductPosts(user.id)
        items = products.map(p => `${p.product_posts?.title || 'Unnamed Product'} - ${p.content || ''}`)
        break
      }
      case 'collections':
        items = ['Collection 1', 'Collection 2'] // TODO: 后续接口
        break
      case 'shares':
        items = ['Shared Post X', 'Shared Post Y'] // TODO: 后续接口
        break
      case 'likes':
        items = ['Liked Post Alpha', 'Liked Post Beta'] // TODO: 后续接口
        break
    }

    const ul = document.createElement('ul')
    ul.style.listStyle = 'none'
    ul.style.padding = '0'
    items.forEach(it => {
      const li = document.createElement('li')
      li.textContent = it
      li.style.padding = '8px'
      li.style.borderBottom = '1px solid #eee'
      ul.appendChild(li)
    })
    container.innerHTML = ''
    container.appendChild(ul)
  } catch (err) {
    container.innerHTML = `<p>Error loading posts: ${err.message}</p>`
  }
}
