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
  test('Shopify OAuth connect UI; others greyed Prossimamente', async ({ page }) => {
    fs.mkdirSync(ADMIN_MEDIA, { recursive: true })

    await page.goto('/#admin')
    await expect(page.getByRole('heading', { name: /Accedi ad Admin/i })).toBeVisible({
      timeout: 15_000,
    })
    await loginAs(page, 'admin@demo', 'admin-demo')

    await expect(page.getByTestId('admin-hub')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('admin-tile-connectors').click()

    await expect(page.getByTestId('admin-commerce-connectors')).toBeVisible()
    await expect(page.getByTestId('connector-shopify')).toHaveAttribute('data-status', 'included')
    await expect(page.getByTestId('connector-shopify-connect')).toContainText(/Collega con Shopify/i)
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

    // Fixture OAuth completes in-browser (mock Partner install)
    await page.getByTestId('connector-shopify-connect').click()
    await expect(page.getByTestId('connector-shopify-status')).toContainText(/Collegato/i, {
      timeout: 10_000,
    })
    await expect(page.getByTestId('connector-shopify-name')).toBeVisible()
    await expect(page.getByTestId('connector-shopify-domain')).toContainText(/myshopify\.com/i)
    await expect(page.getByTestId('connector-shopify-disconnect')).toBeVisible()
    await expect(page.getByTestId('connector-shopify-reconnect')).toBeVisible()

    const out = path.join(ADMIN_MEDIA, 'commerce-connectors.png')
    await page.getByTestId('admin-commerce-connectors').screenshot({ path: out })
    expect(fs.existsSync(out)).toBe(true)
  })
})
