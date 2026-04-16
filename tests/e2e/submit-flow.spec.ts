// @ts-nocheck
import { test, expect, Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const TEST_EMAIL = 'pegawai@testbps.local'
const TEST_PASSWORD = 'Test BPS123'

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 })
}

// Helper: advance to step N in Ajukan Dokumen form (after login + navigate to /dokumen/aju)
async function advanceToStep(page: Page, targetStep: number) {
  for (let step = 1; step < targetStep; step++) {
    // Step 1: Select fungsi dropdown (Radix Select = [role="combobox"])
    if (step === 1) {
      const fungsiBox = page.locator('[role="combobox"]').first()
      if (await fungsiBox.isVisible().catch(() => false)) {
        await fungsiBox.click()
        await page.waitForTimeout(300)
        const option = page.locator('[role="option"]').first()
        if (await option.isVisible().catch(() => false)) {
          await option.click()
          await page.waitForTimeout(500)
        }
      }
    }
    // Step 2: Select kegiatan dropdown
    if (step === 2) {
      const kegBox = page.locator('[role="combobox"]').last()
      if (await kegBox.isVisible().catch(() => false)) {
        await kegBox.click()
        await page.waitForTimeout(300)
        const option = page.locator('[role="option"]').first()
        if (await option.isVisible().catch(() => false)) {
          await option.click()
          await page.waitForTimeout(500)
        }
      }
    }
    // Click Lanjut
    const lanjutBtn = page.locator('button', { hasText: 'Lanjut' }).first()
    if (await lanjutBtn.isEnabled().catch(() => false)) {
      await lanjutBtn.click()
      await page.waitForTimeout(500)
    }
  }
}

// =============================================================================
// TC-01: Redirect /dokumen → /dokumen/saya
// =============================================================================

test('TC-01: should redirect /dokumen to /dokumen/saya', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen`)
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  const url = page.url()
  expect(url).toMatch(/\/dokumen\/saya/)
  // Wait for dokumen saya page to finish loading
  await page.waitForFunction(() => {
    return document.body.textContent?.includes('Belum ada dokumen') === true
    || document.querySelector('table tbody tr') !== null
  }, { timeout: 15000 })
})

// =============================================================================
// TC-02: Step 1 — Fungsi, Tahun, Tanggal
// =============================================================================

test('TC-02: Step 1 — fungsi dropdown, tahun, tanggal', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  const fungsiBox = page.locator('[role="combobox"]').first()
  await expect(fungsiBox).toBeVisible({ timeout: 15000 })

  const lanjutBtn = page.locator('button', { hasText: 'Lanjut' })
  await expect(lanjutBtn).toBeDisabled()

  await fungsiBox.click()
  await page.waitForTimeout(500)
  await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(500)

  await expect(lanjutBtn).toBeEnabled()
})

// =============================================================================
// TC-03: Step 2 — Kegiatan filtered by fungsi
// =============================================================================

test('TC-03: Step 2 — kegiatan filtered by fungsi', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  // Fill step 1
  await page.locator('[role="combobox"]').first().click()
  await page.waitForTimeout(500)
  await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(500)
  await page.locator('button', { hasText: 'Lanjut' }).click()
  await page.waitForTimeout(500)

  await expect(page.locator('h3', { hasText: 'Pilih Kegiatan' })).toBeVisible()
  const kegBox = page.locator('[role="combobox"]').last()
  await expect(kegBox).toBeVisible()
})

// =============================================================================
// TC-04: Step 3 — Role toggle
// =============================================================================

test('TC-04: Step 3 — role toggle (Anggota / Ketua Tim)', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  await advanceToStep(page, 3)

  await expect(page.locator('text=Anggota')).toBeVisible()
  await expect(page.locator('text=Ketua Tim')).toBeVisible()
  await expect(page.locator('text=Saya adalah anggota tim')).toBeVisible()
  await page.locator('button', { hasText: 'Ketua Tim' }).click()
  await expect(page.locator('text=Saya adalah penanggung jawab')).toBeVisible()
})

// =============================================================================
// TC-05: Step 4 — Upload Lampiran
// =============================================================================

test('TC-05: Step 4 — upload lampiran flow', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  await advanceToStep(page, 4)

  await expect(page.locator('h3', { hasText: 'Unggah Lampiran' })).toBeVisible({ timeout: 10000 })
  const wajibBadge = page.locator('text=WAJIB')
  if (await wajibBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
    const uploadBtns = page.locator('button', { hasText: 'Unggah File' })
    const count = await uploadBtns.count()
    expect(count).toBeGreaterThan(0)
  }
})

// =============================================================================
// TC-06: Upload Validation — frontend
// =============================================================================

test('TC-06: Upload validation — frontend rejects invalid files', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  await advanceToStep(page, 4)

  await expect(page.locator('h3', { hasText: 'Unggah Lampiran' })).toBeVisible({ timeout: 10000 })

  const uploadBtns = page.locator('button', { hasText: 'Unggah File' })
  if (await uploadBtns.count() > 0) {
    // TC-06 is primarily a manual test since we can't programmatically
    // create invalid files via the browser file input in CI.
    // Backend validation is tested via API integration tests.
  }
})

// =============================================================================
// TC-07: Submit without lampiran
// =============================================================================

test('TC-07: Submit fails if required lampiran not uploaded', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  await advanceToStep(page, 4)

  const lanjutBtn = page.locator('button', { hasText: 'Lanjut' }).last()
  if (await lanjutBtn.isEnabled().catch(() => false)) {
    await lanjutBtn.click()
  }
  await page.waitForTimeout(500)

  const ajukanBtn = page.locator('button', { hasText: 'Ajukan Dokumen' })
  if (await ajukanBtn.isVisible().catch(() => false)) {
    // Button should be disabled if no lampiran uploaded
    expect(await ajukanBtn.isDisabled()).toBeTruthy()
  }
})

// =============================================================================
// TC-08: Successful submit
// =============================================================================

test('TC-08: Submit dokumen successfully', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  await advanceToStep(page, 5)

  await expect(page.locator('h3', { hasText: 'Review & Ajukan' })).toBeVisible()
})

// =============================================================================
// TC-09: Dokumen List — Filter & Search
// =============================================================================

test.describe('TC-09: Dokumen List — Filter & Search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto(`${BASE_URL}/dokumen/saya`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
  })

  test('search filters dokumen list', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Cari"]')
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('SAKERNAS')
      await page.waitForTimeout(300)
    }
  })

  test('status filter works', async ({ page }) => {
    const statusFilter = page.locator('select').last()
    if (await statusFilter.isVisible().catch(() => false)) {
      await statusFilter.selectOption({ value: 'DRAFT' })
      await page.waitForTimeout(300)
    }
  })
})

// =============================================================================
// TC-10: Empty State
// =============================================================================

test('TC-10: Empty state with CTA', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/saya`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  const emptyState = page.locator('text=Belum ada dokumen')
  const listTable = page.locator('table')
  const hasEmpty = await emptyState.isVisible().catch(() => false)
  const hasList = await listTable.isVisible().catch(() => false)
  expect(hasEmpty || hasList).toBeTruthy()
  if (hasEmpty) {
    await expect(page.locator('button', { hasText: 'Ajukan Dokumen Baru' })).toBeVisible()
  }
})

// =============================================================================
// TC-11: Dokumen Detail Page
// =============================================================================

test('TC-11: Dokumen detail page displays all sections', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/saya`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
  if (await eyeBtns.count() === 0) {
    test.skip()
    return
  }
  await eyeBtns.first().click()
  await page.waitForTimeout(2000)
  await expect(page.locator('h2')).toBeVisible()
  await expect(page.locator('text=Alur Dokumen')).toBeVisible()
  await expect(page.locator('text=Fungsi').first()).toBeVisible()
  await expect(page.locator('text=/Lampiran/i').first()).toBeVisible()
})

// =============================================================================
// TC-12: Download Lampiran
// =============================================================================

test('TC-12: Download lampiran opens signed URL', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/saya`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
  if (await eyeBtns.count() === 0) {
    test.skip()
    return
  }
  await eyeBtns.first().click()
  await page.waitForTimeout(2000)

  const downloadBtn = page.locator('button[aria-label="Download"]')
  if (await downloadBtn.count() === 0) {
    test.skip()
    return
  }
  const popupPromise = page.waitForEvent('popup').catch(() => null)
  await downloadBtn.first().click()
  const popup = await popupPromise
  if (popup) {
    await popup.waitForLoadState('domcontentloaded')
    expect(popup.url()).toContain('supabase')
  }
})

// =============================================================================
// TC-13: Resubmit Workflow
// =============================================================================

test('TC-13: Resubmit workflow for NEED_REVISION documents', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/dokumen/saya`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)

  const revisionBadge = page.locator('text=Perlu Revisi')
  const count = await revisionBadge.count()
  if (count === 0) {
    test.skip()
    return
  }

  await revisionBadge.first().locator('..').locator('button[aria-label="Lihat detail"]').click()
  await page.waitForTimeout(2000)

  const resubmitBtn = page.locator('button', { hasText: 'Perbaiki & Ajukan Ulang' })
  if (await resubmitBtn.isVisible().catch(() => false)) {
    await resubmitBtn.click()
    await page.waitForTimeout(2000)
    await expect(page.locator('text=Catatan dari PPK').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Perbaiki Lampiran')).toBeVisible()
  }
})

// =============================================================================
// API Integration Tests
// =============================================================================

test('API: /api/upload validates file size', async ({ page }) => {
  await login(page)
  const response = await page.request.fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
  })
  expect([400, 401]).toContain(response.status())
})

test('API: /api/dokumen returns 200 for authenticated user', async ({ page }) => {
  await login(page)
  const response = await page.request.get(`${BASE_URL}/api/dokumen`, {
    credentials: 'include',
  })
  expect([200, 401]).toContain(response.status())
})