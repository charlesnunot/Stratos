// docs/components/Publish/Publish.js
import { getUser } from '../../store/userManager.js'
import { createNormalPost, createProductPost } from '../../store/postApi.js'

const baseURL = new URL('.', import.meta.url)

export async function mountPublish(container) {
  if (!container) return

  // 加载 Publish HTML & CSS
  const html = await fetch(new URL('Publish.html', baseURL)).then(res => res.text())
  container.innerHTML = html
  loadCSS(new URL('Publish.css', baseURL))

  const tabNormal = container.querySelector('#tab-normal')
  const tabProduct = container.querySelector('#tab-product')
  const contentArea = container.querySelector('#publish-content-area')

  // 默认加载普通帖子
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

  // -----------------------------
  // 普通帖子
  // -----------------------------
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

    setupTagInput(tagsInput, tagsDisplay)

    // 图片逻辑
    let selectedFiles = []
    addCard.addEventListener('click', () => imageInput.click())

    imageInput.addEventListener('change', () => {
      const files = Array.from(imageInput.files)
      selectedFiles = files.slice(0, 4)
      renderPreviews(selectedFiles, previewContainer)
    })

    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const content = textarea.value.trim()
      const tags = Array.from(tagsDisplay.children).map(tag => tag.textContent)
      const files = selectedFiles

      if (!content) {
        feedback.textContent = 'Content cannot be empty'
        feedback.style.color = 'red'
        return
      }

      feedback.textContent = 'Publishing post...'
      feedback.style.color = 'blue'

      try {
        await createNormalPost({ content, tags, images: files, visibility: 'public' })
        feedback.textContent = 'Normal post published!'
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

  // -----------------------------
  // 产品帖子
  // -----------------------------
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

    // 图片逻辑
    let selectedFiles = []
    addCard.addEventListener('click', () => imageInput.click())

    imageInput.addEventListener('change', () => {
      const files = Array.from(imageInput.files)
      selectedFiles = files.slice(0, 4)
      renderPreviews(selectedFiles, previewContainer)
    })

    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const files = selectedFiles
      const productData = {
        title: contentArea.querySelector('#product-title')?.value.trim(),
        description: contentArea.querySelector('#product-description')?.value.trim(),
        price: parseFloat(contentArea.querySelector('#product-price')?.value),
        stock: parseInt(contentArea.querySelector('#product-stock')?.value),
        shippingfee: parseFloat(contentArea.querySelector('#product-shipping')?.value),
        link: contentArea.querySelector('#product-link')?.value.trim(),
        condition: contentArea.querySelector('#product-condition')?.value,
        tags: Array.from(tagsDisplay.children).map(tag => tag.textContent),
        images: files
      }

      if (!productData.title || !productData.description) {
        feedback.textContent = 'Product title and description cannot be empty'
        feedback.style.color = 'red'
        return
      }

      feedback.textContent = 'Publishing product...'
      feedback.style.color = 'blue'

      try {
        await createProductPost(productData)
        feedback.textContent = 'Product post published!'
        feedback.style.color = 'green'
        clearProductForm(contentArea, tagsDisplay)
        selectedFiles = []
        renderPreviews(selectedFiles, previewContainer)
        imageInput.value = ''
      } catch (err) {
        console.error(err)
        feedback.textContent = 'Failed to publish product post'
        feedback.style.color = 'red'
      }
    })
  }

  // -----------------------------
  // 标签输入逻辑
  // -----------------------------
  function setupTagInput(inputEl, displayEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        e.preventDefault()
        const tag = document.createElement('div')
        tag.className = 'tag-item'
        tag.textContent = inputEl.value.trim()
        displayEl.appendChild(tag)
        inputEl.value = ''
      }
    })
  }

  // -----------------------------
  // 清空产品表单
  // -----------------------------
  function clearProductForm(container, tagsDisplay) {
    const fields = ['title', 'description', 'price', 'stock', 'shipping', 'link']
    fields.forEach(key => {
      const el = container.querySelector(`#product-${key}`)
      if (el) el.value = ''
    })
    tagsDisplay.innerHTML = ''
  }
}

// -----------------------------
// 渲染图片预览（通用）
// -----------------------------
function renderPreviews(selectedFiles, previewContainer) {
  previewContainer.innerHTML = ''
  selectedFiles.forEach(file => {
    const reader = new FileReader()
    reader.onload = e => {
      const wrapper = document.createElement('div')
      wrapper.className = 'preview-wrapper'

      const img = document.createElement('img')
      img.src = e.target.result
      img.className = 'preview-img'

      const delBtn = document.createElement('button')
      delBtn.className = 'preview-del'
      delBtn.textContent = '×'
      delBtn.addEventListener('click', () => {
        selectedFiles.splice(selectedFiles.indexOf(file), 1)
        renderPreviews(selectedFiles, previewContainer)
      })

      wrapper.appendChild(img)
      wrapper.appendChild(delBtn)
      previewContainer.appendChild(wrapper)
    }
    reader.readAsDataURL(file)
  })
}

// -----------------------------
// 加载 CSS
// -----------------------------
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
