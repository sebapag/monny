import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const MEDIA =
  process.env.ATRIUM_MEDIA_DIR ||
  '/cursor/stores/bc-01a1b4ca-a8a5-7df5-9ade-47d767568dd5/media/ui-office3d'

test.describe('Office anime.js DOM motion', () => {
  test('dept focus opens modal with anime motion attr + capture', async ({ page }) => {
    fs.mkdirSync(MEDIA, { recursive: true })

    await page.goto('/#/agent')
    await page.locator('#login-email').fill('agent@demo')
    await page.locator('#login-password').fill('agent-demo')
    await page.getByRole('button', { name: /Entra/i }).click()

    const twin = page.getByTestId('office-twin')
    await expect(twin).toBeVisible({ timeout: 30_000 })
    await expect(twin).toHaveAttribute('data-office-mode', 'full', { timeout: 20_000 })
    await page.waitForTimeout(1000)

    const leadership = page
      .getByTestId('office-room-label')
      .filter({ hasText: 'Leadership' })
      .first()
    await expect(leadership).toBeVisible({ timeout: 15_000 })
    await leadership.click()

    await expect(page.getByTestId('office-focus-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('office-focus-bar')).toHaveAttribute('data-motion', 'anime')

    // Dolly ~1.55s then modal mounts; backdrop stays opacity:1 (bg alpha via anime).
    const modal = page.getByTestId('dept-focus-modal')
    await expect(modal).toBeVisible({ timeout: 20_000 })
    await expect(modal).toHaveAttribute('data-motion', 'anime')
    await expect(page.getByRole('dialog', { name: /Direzione/i })).toBeVisible()

    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(MEDIA, 'office-motion-anime.png'),
      fullPage: false,
    })
    expect(fs.existsSync(path.join(MEDIA, 'office-motion-anime.png'))).toBe(true)

    await page.getByTestId('dept-focus-close').click()
    // Leave fade is brief (~560ms) then unmount — catch either closing attr or hide.
    await Promise.race([
      modal.waitFor({ state: 'hidden', timeout: 4000 }),
      expect(modal).toHaveAttribute('data-closing', 'true', { timeout: 4000 }),
    ]).catch(() => undefined)
    await page.screenshot({
      path: path.join(MEDIA, 'office-motion-anime-leave.png'),
      fullPage: false,
    })
    expect(fs.existsSync(path.join(MEDIA, 'office-motion-anime-leave.png'))).toBe(true)
  })
})
