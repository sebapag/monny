import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ADMIN_MEDIA =
  process.env.ATRIUM_ADMIN_MEDIA_DIR ||
  '/cursor/stores/bc-01a1b4ca-a8a5-7df5-9ade-47d767568dd5/media/admin'

async function loginAs(page: Page, email: string, password: string) {
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: /Entra/i }).click()
}

test.describe('Admin commerce connectors', () => {
  test('Shopify enabled, other platforms greyed Prossimamente', async ({ page }) => {
    fs.mkdirSync(ADMIN_MEDIA, { recursive: true })

    await page.goto('/#admin')
    await expect(page.getByRole('heading', { name: /Accedi ad Admin/i })).toBeVisible({
      timeout: 15_000,
    })
    await loginAs(page, 'admin@demo', 'admin-demo')

    await expect(page.getByTestId('admin-hub')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('admin-tile-connectors')).toBeVisible()
    await page.getByTestId('admin-tile-connectors').click()

    await expect(page.getByTestId('admin-commerce-connectors')).toBeVisible()
    await expect(page.getByTestId('connector-shopify')).toHaveAttribute('data-status', 'included')
    await expect(page.getByTestId('connector-shopify-connect')).toBeVisible()
    await expect(page.getByTestId('connector-magento')).toHaveAttribute('data-status', 'coming_soon')
    await expect(page.getByTestId('connector-soon-magento')).toContainText(/Prossimamente/i)
    await expect(page.getByTestId('connector-salesforce_commerce')).toHaveAttribute(
      'data-status',
      'coming_soon',
    )
    await expect(page.getByTestId('connector-woocommerce')).toHaveAttribute(
      'data-status',
      'coming_soon',
    )

    const out = path.join(ADMIN_MEDIA, 'commerce-connectors.png')
    await page.getByTestId('admin-commerce-connectors').screenshot({ path: out })
    expect(fs.existsSync(out)).toBe(true)
  })
})
