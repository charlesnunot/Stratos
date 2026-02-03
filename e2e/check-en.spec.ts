import { test, expect } from '@playwright/test'

/**
 * /en 首页检查（对应上线清单核心链路与 UI 快速检查）
 * 确保：不白屏、关键区域存在、无严重控制台错误
 */
test.describe('/en 页面检查', () => {
  test('GET /en 返回 200，页面可加载', async ({ page }) => {
    const res = await page.goto('/en')
    expect(res?.status()).toBe(200)
  })

  test('主内容区存在且非空（不白屏）', async ({ page }) => {
    await page.goto('/en')
    const main = page.locator('main')
    await expect(main).toBeVisible()
    await expect(main).not.toBeEmpty({ timeout: 15000 })
  })

  test('布局包含侧栏或顶栏（导航可见）', async ({ page }) => {
    await page.goto('/en')
    const nav = page.locator('nav, [role="navigation"], header, aside').first()
    await expect(nav).toBeVisible({ timeout: 10000 })
  })

  test('body 有内容、非纯白', async ({ page }) => {
    await page.goto('/en')
    const body = page.locator('body')
    await expect(body).toHaveCount(1)
    const text = await body.textContent()
    expect(text?.trim().length).toBeGreaterThan(100)
  })

  test('无未捕获的严重控制台错误', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error') {
        const text = msg.text()
        if (!text.includes('ResizeObserver') && !text.includes('Hydration')) {
          errors.push(text)
        }
      }
    })
    await page.goto('/en')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2000)
    expect(errors).toEqual([])
  })
})
