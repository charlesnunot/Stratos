// docs/store/pageLoader.js
import { pageRegistry } from './pageRegistry.js'
import { savePageState, getPageState } from './pageStateStore.js'

let currentPage = null

/**
 * 加载指定页面
 * @param {string} pageName 页面名字，如 'home' 或 'profile'
 */
export async function loadPage(pageName) {
  const mainRoot = document.getElementById('main-root')
  if (!mainRoot) return

  // -----------------------------
  // 1️⃣ 保存旧页面状态
  // -----------------------------
  if (currentPage) {
    const oldPage = pageRegistry[currentPage]
    if (oldPage?.saveState) {
      try {
        const state = oldPage.saveState()
        savePageState(currentPage, state)
      } catch (err) {
        console.warn(`保存页面状态失败: ${currentPage}`, err)
      }
    }
  }

  // -----------------------------
  // 2️⃣ 清空容器
  // -----------------------------
  mainRoot.innerHTML = ''

  // -----------------------------
  // 3️⃣ 挂载新页面
  // -----------------------------
  const page = pageRegistry[pageName]
  if (!page?.mount) {
    console.warn('页面未注册或 mount 方法不存在:', pageName)
    return
  }

  const cachedState = getPageState(pageName)

  try {
    await page.mount(mainRoot, cachedState)
  } catch (err) {
    console.error(`加载页面失败: ${pageName}`, err)
  }

  // -----------------------------
  // 4️⃣ 更新当前页面
  // -----------------------------
  currentPage = pageName
}

