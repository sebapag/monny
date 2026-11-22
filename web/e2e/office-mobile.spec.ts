import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const MEDIA =
  process.env.ATRIUM_MEDIA_DIR ||
  '/cursor/stores/bc-01a1b4ca-a8a5-7df5-9ade-47d767568dd5/media/ui-office3d'

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const scrollW = Math.max(doc.scrollWidth, body.scrollWidth)
    const clientW = doc.clientWidth
    return { scrollW, clientW, overflowPx: scrollW - clientW }
  })
  expect(overflow.overflowPx, `horizontal overflow ${overflow.overflowPx}px`).toBeLessThanOrEqual(2)
}

test.describe('Agent office mobile smoke (~390px)', () => {
  test('login → office visible, full 3D default, no overflow', async ({ page }) => {
    fs.mkdirSync(MEDIA, { recursive: true })

    await page.goto('/#/agent')
    await expect(page.getByRole('heading', { name: /Accedi ad Agent/i })).toBeVisible()
    await expect(page.locator('.brand-mark')).toContainText('Atrium')

    await page.locator('#login-email').fill('agent@demo')
    await page.locator('#login-password').fill('agent-demo')
    await page.getByRole('button', { name: /Entra/i }).click()

    const twin = page.getByTestId('office-twin')
    await expect(twin).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Ufficio digitale')).toBeVisible()
    await expect(page.locator('.office-brand-mark')).toContainText('Atrium')

    // Market rule: full 3D by default (light only if WebGL fails).
    await expect(twin).toHaveAttribute('data-office-mode', 'full', { timeout: 20_000 })
    await expect(page.getByTestId('office-mode-badge')).toContainText(/Vista completa/i)

    const stage = page.getByTestId('office-stage')
    await expect(stage).toBeVisible()
    await expect(page.locator('.office-viewport.is-3d canvas')).toBeVisible({ timeout: 20_000 })

    await assertNoHorizontalOverflow(page)

    // Trees render in the WebGL scene; capture overview for visual proof.
    await page.waitForTimeout(1200)
    await page.screenshot({
      path: path.join(MEDIA, 'office-mobile.png'),
      fullPage: true,
    })
    await stage.screenshot({
      path: path.join(MEDIA, 'office-trees.png'),
    })

    expect(fs.existsSync(path.join(MEDIA, 'office-mobile.png'))).toBe(true)
    expect(fs.existsSync(path.join(MEDIA, 'office-trees.png'))).toBe(true)
  })

  test('login form itself has no overflow at 390px', async ({ page }) => {
    await page.goto('/#/agent')
    await expect(page.locator('.login-panel')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })
})
