import { getUser } from '../store/userManager.js'
import { createNormalPost, createProductPost } from '../store/postApi.js'

const baseURL = new URL('.', import.meta.url)

export async function mountPublish(container) {
  if (!container) return

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

  // ------------------------
  // 普通帖子
  // ------------------------
  async function loadNormalPost() {
    const html = await fetch(new URL('NormalPost.html', baseURL)).then(res => res.text())
    contentArea.innerHTML = html
    loadCSS(new URL('NormalPost.css', baseURL))

    const textarea = contentArea.querySelector('#normal-content')
    const submitBtn = contentArea.querySelector('#normal-submit')
    const feedback = contentArea.querySelector('#normal-feedback')

    // 标签功能
    const tagsInput = contentArea.querySelector('#post-tags')
    const tagsDisplay = contentArea.querySelector('#tags-display')
    setupTagInput(tagsInput, tagsDisplay)

    submitBtn.addEventListener('click', async () => {
      const user = getUser()
      if (!user) {
        feedback.textContent = 'Please login first.'
        feedback.style.color = 'red'
        return
      }

      const content = textarea.value.trim()
      const tags = Array.from(tagsDisplay.children).map(tag => tag.textContent)

      if (!content) {
        feedback.textContent = 'Content cannot be empty'
        feedback.style.color = 'red'
        return
      }

      try {
        await createNormalPost({ content, tags, visibility: 'public' })
        feedback.textContent = 'Normal post published!'
        feedback.style.color = 'green'
        textarea.value = ''
        tagsDisplay.innerHTML = ''
      } catch (err) {
        console.error(err)
        feedback.textContent = 'Failed to publish post'
        feedback.style.color = 'red'
      }
    })
  }

  // ------------------------
  // 产品帖子
  // ------------------------
  async function loadProductPost() {
    const html = await fetch(new URL('ProductPost.html', baseURL)).then(res => res.text())
    contentArea.innerHTML = html
    loadCSS(new URL('ProductPost.css', baseURL))

    const submitBtn = contentArea.querySelector('#product-submit')
    const feedback = contentArea.querySelector('#product-feedback')

    // 标签功能
    const tagsInput = contentArea.querySelector('#post-tags')
    const tagsDisplay = contentArea.querySelector('#tags-display')
    setupTagInput(tagsInput, tagsDisplay)

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
        tags: Array.from(tagsDisplay.children).map(tag => tag.textContent),
        images: [] // 后续可接入图片上传逻辑
      }

      // 校验
      if (!productData.title || !productData.description) {
        feedback.textContent = 'Product title and description cannot be empty'
        feedback.style.color = 'red'
        return
      }

      try {
        await createProductPost(productData)
        feedback.textContent = 'Product post published!'
        feedback.style.color = 'green'
        clearProductForm(contentArea, tagsDisplay)
      } catch (err) {
        console.error(err)
        feedback.textContent = 'Failed to publish product post'
        feedback.style.color = 'red'
      }
    })
  }

  // ------------------------
  // 工具函数
  // ------------------------
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

  function clearProductForm(container, tagsDisplay) {
    const fields = ['title', 'description', 'price', 'stock', 'shipping', 'link']
    fields.forEach(key => {
      const el = container.querySelector(`#product-${key}`)
      if (el) el.value = ''
    })
    tagsDisplay.innerHTML = ''
  }
}

// 动态加载 CSS
function loadCSS(href) {
  const url = href.toString()
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}
