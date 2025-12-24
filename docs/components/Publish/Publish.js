// docs/components/Publish/Publish.js
import { getUser } from '../../store/userManager.js'
import { createNormalPost, createProductPost } from '../../store/postApi.js'
import { openFriendsModal } from './FriendsModal.js'
import { openLocationModal } from './LocationModal.js'
import { openVisibilityModal } from './VisibilityModal.js'
import { getUserFollowers, uploadImagesWeb } from '../../store/api.js'

const baseURL = new URL('.', import.meta.url)

export async function mountPublish(container) {
  if (!container) return

  // -----------------------------
  // 加载 Publish HTML & CSS
  // -----------------------------
  const html = await fetch(new URL('Publish.html', baseURL)).then(res => res.text())
  container.innerHTML = html
  loadCSS(new URL('Publish.css', baseURL))

  const tabNormal = container.querySelector('#tab-normal')
  const tabProduct = container.querySelector('#tab-product')
  const contentArea = container.querySelector('#publish-content-area')

  loadNormalPost()

  tabNormal.addEventListener('click', () => {
    tabNormal.classList.add('active')
    tabProduct.classList.remove('active')
    loadNormalPost()
  })

  tabProduct.addEventListener('click', () => {
    tabProduct.classList.add('active')
    tabNormal.classList.remove('active')
    loadProductPost()
  })

  // =========================================================
  // 普通帖子
  // =========================================================
  async function loadNormalPost() {
    const html = await fetch(new URL('NormalPost.html', baseURL)).then(res => res.text())
    contentArea.innerHTML = html
    loadCSS(new URL('NormalPost.css', baseURL))

    const textarea = contentArea.querySelector('#normal-content')
    const submitBtn = contentArea.querySelector('#normal-submit')
    const feedback = contentArea.querySelector('#normal-feedback')
    const imageInput = contentArea.querySelector('#normal-images')
    const addCard = contentArea.querySelector('.image-add-card')
    const tagsInput = contentArea.querySelector('#post-tags')
    const tagsDisplay = contentArea.querySelector('#tags-display')

    const toolsState = await setupPostTools(contentArea)
    setupTagInput(tagsInput, tagsDisplay)

    let selectedFiles = []
    addCard.addEventListener('click', () => imageInput.click())
    imageInput.addEventListener('change', () => {
      selectedFiles = Array.from(imageInput.files).slice(0, 4)
      renderPreviews(selectedFiles, contentArea.querySelector('#normal-preview'))
    })

    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const content = textarea?.value.trim() || ''
      const tags = Array.from(tagsDisplay.children).map(t => t.textContent)
      const location = toolsState.getSelectedLocation()
      const visibility = toolsState.getCurrentVisibility()
      const visibleTo = toolsState.getVisibilityUsers()

      if (!content) {
        feedback.textContent = 'Content cannot be empty'
        feedback.style.color = 'red'
        return
      }

      feedback.textContent = 'Publishing post...'
      feedback.style.color = 'blue'

      try {
        const imageUrls = await uploadImagesWeb(selectedFiles, p => {
          feedback.textContent = `Uploading images... ${Math.round(p*100)}%`
        })

        const postPayload = {
          content,
          tags,
          images: imageUrls,
          location,
          visibility,
          show_to_users: visibleTo
        }

        await createNormalPost(postPayload)
        feedback.textContent = 'Post published!'
        feedback.style.color = 'green'
        textarea.value = ''
        tagsDisplay.innerHTML = ''
        renderPreviews([], contentArea.querySelector('#normal-preview'))
        selectedFiles = []

      } catch (err) {
        console.error(err)
        feedback.textContent = 'Failed to publish post'
        feedback.style.color = 'red'
      }
    })
  }

  // =========================================================
  // 产品帖子
  // =========================================================
  async function loadProductPost() {
    const html = await fetch(new URL('ProductPost.html', baseURL)).then(res => res.text())
    contentArea.innerHTML = html
    loadCSS(new URL('ProductPost.css', baseURL))

    const submitBtn = contentArea.querySelector('#product-submit')
    const feedback = contentArea.querySelector('#product-feedback')
    const imageInput = contentArea.querySelector('#product-images')
    const addCard = contentArea.querySelector('.image-add-card')
    const tagsInput = contentArea.querySelector('#post-tags')
    const tagsDisplay = contentArea.querySelector('#tags-display')

    const toolsState = await setupPostTools(contentArea)
    setupTagInput(tagsInput, tagsDisplay)

    let selectedFiles = []
    addCard.addEventListener('click', () => imageInput.click())
    imageInput.addEventListener('change', () => {
      selectedFiles = Array.from(imageInput.files).slice(0, 4)
      renderPreviews(selectedFiles, contentArea.querySelector('#product-preview'))
    })

    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const location = toolsState.getSelectedLocation()
      const visibility = toolsState.getCurrentVisibility()
      const visibleTo = toolsState.getVisibilityUsers()

      const productData = {
        title: contentArea.querySelector('#product-title')?.value.trim(),
        description: contentArea.querySelector('#product-description')?.value.trim(),
        price: parseFloat(contentArea.querySelector('#product-price')?.value),
        stock: parseInt(contentArea.querySelector('#product-stock')?.value),
        shippingfee: parseFloat(contentArea.querySelector('#product-shipping')?.value),
        link: contentArea.querySelector('#product-link')?.value.trim(),
        condition: contentArea.querySelector('#product-condition')?.value,
        tags: Array.from(tagsDisplay.children).map(t => t.textContent),
        images: selectedFiles,
        location,
        visibility,
        visibleTo
      }

      if (!productData.title || !productData.description) {
        feedback.textContent = 'Title and description required'
        feedback.style.color = 'red'
        return
      }

      feedback.textContent = 'Publishing product...'
      feedback.style.color = 'blue'

      try {
        await createProductPost(productData)
        feedback.textContent = 'Product published!'
        feedback.style.color = 'green'
        clearProductForm(contentArea, tagsDisplay)
        selectedFiles = []
        renderPreviews([], contentArea.querySelector('#product-preview'))
      } catch (err) {
        console.error(err)
        feedback.textContent = 'Failed to publish product'
        feedback.style.color = 'red'
      }
    })
  }
}

// =========================================================
// 通用工具栏逻辑
// =========================================================
async function setupPostTools(container) {
  const toolFriends = container.querySelector('#tool-friends')
  const toolLocation = container.querySelector('#tool-location')
  const toolVisibility = container.querySelector('#tool-visibility')

  let selectedLocation = null
  let currentVisibility = 'public'
  let visibilityUsers = []

  const locationContainer = document.createElement('div')
  locationContainer.style.cssText = `
    margin-top:8px;
    display:flex;
    gap:6px;
    flex-wrap:wrap;
  `
  container.querySelector('.tool-bar').after(locationContainer)

  function renderLocationTag() {
    locationContainer.innerHTML = ''
    if (!selectedLocation) return
    const tag = document.createElement('div')
    tag.style.cssText = `
      display:flex;
      align-items:center;
      gap:6px;
      background:#eef6fd;
      color:#1da1f2;
      padding:4px 8px;
      border-radius:16px;
      font-size:13px;
    `
    tag.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:16px;">location_on</span>
      <span>${selectedLocation.name}</span>
      <span style="cursor:pointer;">×</span>
    `
    tag.lastChild.onclick = () => {
      selectedLocation = null
      renderLocationTag()
    }
    locationContainer.appendChild(tag)
  }

  toolFriends.addEventListener('click', async () => {
    const user = getUser()
    if (!user) return alert('Please login first')
    openFriendsModal(await getUserFollowers(user.id))
  })

  toolLocation.addEventListener('click', () => {
    openLocationModal(loc => {
      selectedLocation = loc
      renderLocationTag()
    })
  })

  toolVisibility.addEventListener('click', async () => {
    openVisibilityModal(currentVisibility, result => {
      currentVisibility = result.type
      if (result.users) visibilityUsers = result.users
      console.log('Selected visibility:', currentVisibility, 'Users:', visibilityUsers)
    })
  })

  return {
    getSelectedLocation: () => selectedLocation,
    getCurrentVisibility: () => currentVisibility,
    getVisibilityUsers: () => visibilityUsers
  }
}

// =========================================================
// 图片预览
// =========================================================
function renderPreviews(files, container) {
  container.innerHTML = ''
  files.forEach(file => {
    const reader = new FileReader()
    reader.onload = e => {
      const wrap = document.createElement('div')
      wrap.className = 'preview-wrapper'
      const img = document.createElement('img')
      img.src = e.target.result
      img.className = 'preview-img'
      const del = document.createElement('button')
      del.className = 'preview-del'
      del.textContent = '×'
      del.onclick = () => {
        files.splice(files.indexOf(file), 1)
        renderPreviews(files, container)
      }
      wrap.appendChild(img)
      wrap.appendChild(del)
      container.appendChild(wrap)
    }
    reader.readAsDataURL(file)
  })
}

// =========================================================
// 标签输入
// =========================================================
function setupTagInput(input, display) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault()
      const tag = document.createElement('div')
      tag.className = 'tag-item'
      tag.textContent = input.value.trim()
      display.appendChild(tag)
      input.value = ''
    }
  })
}

// =========================================================
// 清空产品表单
// =========================================================
function clearProductForm(container, tagsDisplay) {
  const fields = ['title', 'description', 'price', 'stock', 'shipping', 'link']
  fields.forEach(key => {
    const el = container.querySelector(`#product-${key}`)
    if (el) el.value = ''
  })
  tagsDisplay.innerHTML = ''
}

// =========================================================
// CSS Loader
// =========================================================
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
