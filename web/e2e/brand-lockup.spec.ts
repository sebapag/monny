import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const MEDIA =
  process.env.ATRIUM_MEDIA_DIR ||
  '/cursor/stores/bc-01a1b4ca-a8a5-7df5-9ade-47d767568dd5/media/ui-office3d'

test.describe('Brand lockup typography', () => {
  test('Agent home brand lockup uses IBM Plex Sans', async ({ page }) => {
    fs.mkdirSync(MEDIA, { recursive: true })

    await page.goto('/#/agent')
    await page.locator('#login-email').fill('agent@demo')
    await page.locator('#login-password').fill('agent-demo')
    await page.getByRole('button', { name: /Entra/i }).click()

    const twin = page.getByTestId('office-twin')
    await expect(twin).toBeVisible({ timeout: 30_000 })

    const mark = page.locator('.office-brand-mark').first()
    await expect(mark).toContainText('Atrium')
    await expect(page.locator('.office-brand-sub').first()).toContainText(/Workspace marketing/i)

    // Wait for webfont so the lockup screenshot shows IBM Plex Sans metrics
    await page.waitForFunction(() => document.fonts.check('700 24px "IBM Plex Sans"'), null, {
      timeout: 15_000,
    })
    await page.waitForTimeout(400)

    const lockup = page.locator('.office-brand-lockup').first()
    await lockup.screenshot({ path: path.join(MEDIA, 'brand-lockup.png') })
    await page.locator('.office-hero-head').first().screenshot({
      path: path.join(MEDIA, 'brand-lockup-hero.png'),
    })
    const nav = page.locator('.brand-lockup').first()
    await expect(nav).toBeVisible()
    await nav.screenshot({ path: path.join(MEDIA, 'brand-lockup-nav.png') })

    const family = await mark.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(family.toLowerCase()).toContain('ibm plex sans')
    expect(family.toLowerCase()).not.toMatch(/inter|roboto|arial|dm sans/)
    expect(fs.existsSync(path.join(MEDIA, 'brand-lockup.png'))).toBe(true)
  })
})
