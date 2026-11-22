import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const OFFICE_MEDIA =
  process.env.ATRIUM_MEDIA_DIR ||
  '/cursor/stores/bc-01a1b4ca-a8a5-7df5-9ade-47d767568dd5/media/ui-office3d'
const ADMIN_MEDIA =
  process.env.ATRIUM_ADMIN_MEDIA_DIR ||
  '/cursor/stores/bc-01a1b4ca-a8a5-7df5-9ade-47d767568dd5/media/admin'

async function loginAs(page: Page, email: string, password: string) {
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: /Entra/i }).click()
}

test.describe('Office walkers + Admin spend', () => {
  test('office stage shows walking ometti (Completa)', async ({ page }) => {
    fs.mkdirSync(OFFICE_MEDIA, { recursive: true })

    await page.goto('/#/agent')
    await loginAs(page, 'agent@demo', 'agent-demo')

    const twin = page.getByTestId('office-twin')
    await expect(twin).toBeVisible({ timeout: 30_000 })
    await expect(twin).toHaveAttribute('data-office-mode', 'full', { timeout: 20_000 })
    await expect(page.locator('.office-viewport.is-3d canvas')).toBeVisible({ timeout: 20_000 })

    // Let calm walkers advance a bit before capture
    await page.waitForTimeout(2800)
    const stage = page.getByTestId('office-stage')
    await stage.screenshot({ path: path.join(OFFICE_MEDIA, 'office-walkers.png') })
    expect(fs.existsSync(path.join(OFFICE_MEDIA, 'office-walkers.png'))).toBe(true)
  })

  test('Admin monthly spend is clear and visible', async ({ page }) => {
    fs.mkdirSync(ADMIN_MEDIA, { recursive: true })

    await page.goto('/#admin')
    await expect(page.getByRole('heading', { name: /Accedi ad Admin/i })).toBeVisible({
      timeout: 15_000,
    })
    await loginAs(page, 'admin@demo', 'admin-demo')

    const spend = page.getByTestId('admin-monthly-spend')
    await expect(spend).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('admin-ads-spent')).toBeVisible()
    await expect(page.getByTestId('admin-charge-atrium')).toContainText(/Atrium/i)
    await expect(page.getByTestId('admin-charge-ads')).toContainText(/Google e Meta/i)
    await expect(page.getByTestId('admin-shop-urls')).toBeVisible()
    await expect(page.getByTestId('admin-ads-accounts')).toBeVisible()
    await expect(page.getByTestId('meta-ad-account-id')).toBeVisible()

    await page.screenshot({
      path: path.join(ADMIN_MEDIA, 'admin-spend-month.png'),
      fullPage: true,
    })
    await spend.screenshot({
      path: path.join(ADMIN_MEDIA, 'admin-spend-hero.png'),
    })
    expect(fs.existsSync(path.join(ADMIN_MEDIA, 'admin-spend-month.png'))).toBe(true)
  })
})
