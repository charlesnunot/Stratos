// docs/components/Publish/Publish.js
import { getUser } from '../../store/userManager.js'
import { createNormalPost, createProductPost } from '../../store/postApi.js'
import { getUserFollowers } from '../../store/api.js'

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
    const previewContainer = contentArea.querySelector('#normal-preview')

    const tagsInput = contentArea.querySelector('#post-tags')
    const tagsDisplay = contentArea.querySelector('#tags-display')

    const toolFriends = contentArea.querySelector('#tool-friends')

    setupTagInput(tagsInput, tagsDisplay)

    // -----------------------------
    // @Friends
    // -----------------------------
    toolFriends.addEventListener('click', async () => {
      const user = getUser()
      console.log('[Friends] current user', user)
      if (!user) {
        alert('Please login first')
        return
      }

      const followers = await getUserFollowers(user.id)
      console.log('[Friends] followers', followers)
      openFriendsModal(followers, textarea)
    })

    // -----------------------------
    // 图片逻辑
    // -----------------------------
    let selectedFiles = []

    addCard.addEventListener('click', () => imageInput.click())

    imageInput.addEventListener('change', () => {
      selectedFiles = Array.from(imageInput.files).slice(0, 4)
      renderPreviews(selectedFiles, previewContainer)
    })

    // -----------------------------
    // 提交
    // -----------------------------
    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const content = textarea.value.trim()
      const tags = Array.from(tagsDisplay.children).map(t => t.textContent)

      if (!content) {
        feedback.textContent = 'Content cannot be empty'
        feedback.style.color = 'red'
        return
      }

      feedback.textContent = 'Publishing post...'
      feedback.style.color = 'blue'

      try {
        await createNormalPost({
          content,
          tags,
          images: selectedFiles,
          visibility: 'public'
        })

        feedback.textContent = 'Post published!'
        feedback.style.color = 'green'

        textarea.value = ''
        tagsDisplay.innerHTML = ''
        selectedFiles = []
        renderPreviews(selectedFiles, previewContainer)
        imageInput.value = ''
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
    const previewContainer = contentArea.querySelector('#product-preview')

    const tagsInput = contentArea.querySelector('#post-tags')
    const tagsDisplay = contentArea.querySelector('#tags-display')

    setupTagInput(tagsInput, tagsDisplay)

    let selectedFiles = []

    addCard.addEventListener('click', () => imageInput.click())

    imageInput.addEventListener('change', () => {
      selectedFiles = Array.from(imageInput.files).slice(0, 4)
      renderPreviews(selectedFiles, previewContainer)
    })

    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const productData = {
        title: contentArea.querySelector('#product-title')?.value.trim(),
        description: contentArea.querySelector('#product-description')?.value.trim(),
        price: parseFloat(contentArea.querySelector('#product-price')?.value),
        stock: parseInt(contentArea.querySelector('#product-stock')?.value),
        shippingfee: parseFloat(contentArea.querySelector('#product-shipping')?.value),
        link: contentArea.querySelector('#product-link')?.value.trim(),
        condition: contentArea.querySelector('#product-condition')?.value,
        tags: Array.from(tagsDisplay.children).map(t => t.textContent),
        images: selectedFiles
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
        renderPreviews(selectedFiles, previewContainer)
        imageInput.value = ''
      } catch (err) {
        console.error(err)
        feedback.textContent = 'Failed to publish product'
        feedback.style.color = 'red'
      }
    })
  }
}

// =========================================================
// 图片预览（支持删除）
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
// @Friends Modal
// =========================================================
function openFriendsModal(followers, textarea) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.4);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background:#fff;
    width:320px;
    max-height:420px;
    display:flex;
    flex-direction:column;
    border-radius:8px;
    overflow:hidden;
  `

  // ---------- Header ----------
  const header = document.createElement('div')
  header.style.cssText = `
    padding:10px 12px;
    font-weight:600;
    border-bottom:1px solid #eee;
  `
  header.textContent = 'Mention followers'

  // ---------- Content ----------
  const content = document.createElement('div')
  content.style.cssText = `
    padding:8px;
    flex:1;
    overflow:auto;
  `

  // ---------- Footer ----------
  const footer = document.createElement('div')
  footer.style.cssText = `
    padding:8px;
    display:flex;
    justify-content:flex-end;
    gap:8px;
    border-top:1px solid #eee;
  `

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'Cancel'
  cancelBtn.onclick = () => document.body.removeChild(modal)

  const confirmBtn = document.createElement('button')
  confirmBtn.textContent = 'Confirm'
  confirmBtn.style.cssText = `
    background:#1da1f2;
    color:#fff;
    border:none;
    padding:6px 12px;
    border-radius:6px;
    cursor:pointer;
  `

  footer.append(cancelBtn, confirmBtn)

  // =================================================
  // 没有粉丝
  // =================================================
  if (!followers || followers.length === 0) {
    const empty = document.createElement('div')
    empty.style.cssText = `
      padding:20px;
      text-align:center;
      color:#666;
      font-size:14px;
    `
    empty.textContent = "You don’t have any followers yet."
    content.appendChild(empty)

    box.append(header, content)
    modal.appendChild(box)
    modal.onclick = e => e.target === modal && document.body.removeChild(modal)
    document.body.appendChild(modal)
    return
  }

  // =================================================
  // 有粉丝（多选）
  // =================================================
  const selected = new Set()

  followers.forEach(f => {
    const item = document.createElement('div')
    item.style.cssText = `
      display:flex;
      align-items:center;
      gap:8px;
      padding:6px;
      border-radius:6px;
      cursor:pointer;
    `

    item.innerHTML = `
      <img src="${f.avatar_url}" width="32" height="32" style="border-radius:50%">
      <span>@${f.username}</span>
    `

    item.onclick = () => {
      if (selected.has(f.username)) {
        selected.delete(f.username)
        item.style.background = ''
      } else {
        selected.add(f.username)
        item.style.background = 'rgba(29,161,242,0.12)'
      }
    }

    content.appendChild(item)
  })

  confirmBtn.onclick = () => {
    if (selected.size > 0) {
      textarea.value += ' ' + Array.from(selected).map(u => `@${u}`).join(' ') + ' '
    }
    document.body.removeChild(modal)
  }

  box.append(header, content, footer)
  modal.appendChild(box)

  modal.onclick = e => {
    if (e.target === modal) document.body.removeChild(modal)
  }

  document.body.appendChild(modal)
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
