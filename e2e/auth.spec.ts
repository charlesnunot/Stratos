import { test, expect } from '@playwright/test'

/**
 * 登录/注册页检查（对应测试清单 一.1 注册/登录/身份）
 * 确保：登录页可访问、表单存在、多语言路由存在
 */
test.describe('登录/注册页检查', () => {
  test('GET /en/login 返回 200', async ({ page }) => {
    const res = await page.goto('/en/login')
    expect(res?.status()).toBe(200)
  })

  test('GET /zh/login 返回 200', async ({ page }) => {
    const res = await page.goto('/zh/login')
    expect(res?.status()).toBe(200)
  })

  test('登录页有表单或登录入口', async ({ page }) => {
    await page.goto('/en/login')
    const form = page.locator('form, [role="form"], button[type="submit"]').first()
    await expect(form).toBeVisible({ timeout: 10000 })
  })

  test('忘记密码入口可访问', async ({ page }) => {
    const res = await page.goto('/en/forgot-password')
    expect(res?.status()).toBe(200)
  })
})
