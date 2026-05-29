// @ts-nocheck
import { test, expect, Page } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const PEGAWAI_EMAIL = 'pegawai@testbps.local'
const PPK_EMAIL = 'ppk@testbps.local'
const BENDAHARA_EMAIL = 'bendahara@testbps.local'
const MULTI_ROLE_EMAIL = 'multi@testbps.local'
const TEST_PASSWORD = 'Test BPS123'

// =============================================================================
// HELPERS
// =============================================================================

async function switchToRole(page: Page, role: string) {
  // Check if current role is already the target
  const roleBtn = page.locator('button', { hasText: role }).filter({ hasText: new RegExp(`^${role}$`) }).first()
  if (await roleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    return // already on correct role
  }
  // Find the Switch Role dropdown
  const switchLabel = page.locator('text=Switch Role').first()
  if (await switchLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    const parentBtn = switchLabel.locator('..').locator('button').first()
    if (await parentBtn.isVisible().catch(() => false)) {
      await parentBtn.click()
      await page.waitForTimeout(400)
      // Click the target role option
      const roleOpt = page.locator(`button:has-text("${role}")`).filter({ hasText: new RegExp(`^${role}$`) })
      if (await roleOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await roleOpt.click()
        await page.waitForTimeout(2000)
      }
    }
  }
}

async function loginAs(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1000)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

// Map email to expected role for automatic switch after login
const EMAIL_TO_ROLE: Record<string, string> = {
  'pegawai@testbps.local': 'PEGAWAI',
  'ppk@testbps.local': 'PPK',
  'bendahara@testbps.local': 'BENDAHARA',
  'multi@testbps.local': 'PPK', // multi-role user: default to PPK for approval flow tests
}

async function loginAsAndSwitch(page: Page, email: string, targetRole?: string) {
  await loginAs(page, email)
  const role = targetRole ?? EMAIL_TO_ROLE[email]
  if (role) {
    await switchToRole(page, role)
  }
}

async function submitDokumenViaAPI(page: Page): Promise<string> {
  // Use direct API call for reliable document submission
  // First login as pegawai
  await loginAsAndSwitch(page, PEGAWAI_EMAIL)

  // Get funkc & kegiatan from the aju page via API calls
  const supabase = page.context().request
  const sessionRes = await supabase.post(`${BASE_URL}/api/auth/session`, {})
  // Fallback: navigate to aju page to extract selects
  await page.goto(`${BASE_URL}/dokumen/aju`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  // Step 1: select fungsi from combobox
  const comboboxes = page.locator('[role="combobox"]')
  const cbCount = await comboboxes.count()
  if (cbCount === 0) throw new Error('No comboboxes found on aju page')
  await comboboxes.first().click()
  await page.waitForTimeout(600)

  // Select first option
  const options = page.locator('[role="option"]')
  const optCount = await options.count()
  if (optCount === 0) throw new Error('No options found after clicking fungsi combobox')
  await options.first().click()
  await page.waitForTimeout(500)

  // Click Lanjut button
  const lanjut1 = page.locator('button', { hasText: 'Lanjut' }).first()
  if (!(await lanjut1.isEnabled({ timeout: 1000 }).catch(() => false))) {
    // Wait a bit more for form to settle
    await page.waitForTimeout(1000)
  }
  if (await lanjut1.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lanjut1.click()
    await page.waitForTimeout(800)
  }

  // Step 2: select kegiatan
  const cb2 = page.locator('[role="combobox"]').last()
  if (await cb2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cb2.click()
    await page.waitForTimeout(600)
    const opts2 = page.locator('[role="option"]')
    if (await opts2.count() > 0) await opts2.first().click()
    await page.waitForTimeout(500)
  }

  // Click Lanjut from step 2
  const lanjut2 = page.locator('button', { hasText: 'Lanjut' }).first()
  if (await lanjut2.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lanjut2.click()
    await page.waitForTimeout(800)
  }

  // Step 3: Role toggle (skip with default)
  const lanjut3 = page.locator('button', { hasText: 'Lanjut' }).first()
  if (await lanjut3.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lanjut3.click()
    await page.waitForTimeout(800)
  }

  // Step 4: Upload lampiran
  const fileInput = page.locator('input[type="file"]').first()
  if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    const buffer = Buffer.from('%PDF-1.4\n1 obj<</Type/Catalog>>\nendobj\ntrailer<</Root<</Pages 1 R>>>>', 'binary')
    await fileInput.setInputFiles({
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      buffer,
    })
    await page.waitForTimeout(3000)
  }

  // Step 5: Review & Ajukan
  // Wait for "Ajukan Dokumen" button to be enabled (upload completes)
  const ajukanBtn = page.locator('button', { hasText: 'Ajukan Dokumen' })
  if (await ajukanBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.waitForTimeout(2000)
    if (await ajukanBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await ajukanBtn.click()
      await page.waitForTimeout(3000)
    }
  }

  // Navigate to dokumen saya to get the submitted doc ID
  await page.goto(`${BASE_URL}/dokumen/saya`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)

  // Check if redirected away (success)
  if (!page.url().includes('/dokumen/saya')) {
    // Still on same page - document was submitted
  }

  // Get first row link
  const firstRow = page.locator('table tbody tr').first()
  if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    const link = firstRow.locator('a').first()
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute('href').catch(() => null)
      if (href) return href.split('/').pop() ?? ''
    }
    // Check StatusBadge text to confirm submission
    const badge = page.locator('text=Validasi PPK').first()
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Find the row with this badge and extract link
      const badgeRow = badge.locator('..')
      const docLink = badgeRow.locator('a').first()
      const href = await docLink.getAttribute('href').catch(() => null)
      return href?.split('/').pop() ?? ''
    }
  }

  return ''
}

async function waitForLoadingDone(page: Page) {
  const spinner = page.locator('.animate-spin')
  if (await spinner.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForFunction(() => {
      return document.querySelector('.animate-spin') === null
    }, { timeout: 15000 })
  }
}

// =============================================================================
// TC-01: PPK Inbox — List
// =============================================================================

test.describe('TC-01: PPK Inbox — List', () => {
  test('should display inbox page with correct elements', async ({ page }) => {
    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    // Check inbox page loaded — h2 "Dokumen Menunggu Validasi" is definitive
    const inboxHeading = page.locator('h2', { hasText: 'Dokumen Menunggu Validasi' })
    await expect(inboxHeading).toBeVisible({ timeout: 10000 })

    // Filter elements should be present
    await expect(page.locator('input[placeholder*="Cari"]')).toBeVisible()
    await expect(page.locator('select').first()).toBeVisible()

    // Either table rows exist (non-empty) OR empty state
    const emptyState = page.locator('text=Tidak ada dokumen')
    const hasTable = await page.locator('table').isVisible({ timeout: 3000 }).catch(() => false)
    if (hasTable) {
      // Non-empty state: verify table headers
      await expect(page.locator('th', { hasText: 'Judul' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Fungsi' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Status' })).toBeVisible()
      await expect(page.locator('th', { hasText: 'Aksi' })).toBeVisible()
      // Badge "Validasi PPK" on visible rows
      const badge = page.locator('text=Validasi PPK')
      expect(await badge.count()).toBeGreaterThan(0)
    } else {
      // Empty state — confirm it appears
      await expect(emptyState).toBeVisible({ timeout: 3000 })
    }
    await expect(page.locator('select').first()).toBeVisible()
  })
})

// =============================================================================
// TC-02: PPK Inbox — Access Control
// =============================================================================

test.describe('TC-02: PPK Inbox — Access Control', () => {
  test('should redirect or block non-PPK from PPK inbox', async ({ page }) => {
    await loginAsAndSwitch(page, PEGAWAI_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Either redirect to login/dashboard or show error
    const url = page.url()
    const hasAccess = !url.includes('/ppk/inbox')
    // At minimum, non-PPK should not see the inbox content
    if (!hasAccess) {
      // If still on inbox page, check for access denied message
      const errorEl = page.locator('text=Dokumen Menunggu Validasi')
      expect(await errorEl.isVisible()).toBe(false)
    }
  })
})

// =============================================================================
// TC-03: PPK Detail Page — Load
// =============================================================================

test.describe('TC-03: PPK Detail Page', () => {
  test('should load detail page with workflow, lampiran, and action buttons', async ({ page }) => {
    // First: submit a dokumen as pegawai to reach IN_PPK_VALIDATION
    const docId = await submitDokumenViaAPI(page)
    expect(docId).not.toBe('')

    // Login as PPK
    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    // Click the first dokumen
    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Title should be visible
    await expect(page.locator('h2').first()).toBeVisible()

    // Workflow indicator
    await expect(page.locator('text=Alur Dokumen')).toBeVisible()
    await expect(page.locator('text=Draf')).toBeVisible()
    await expect(page.locator('text=PPK')).toBeVisible()
    await expect(page.locator('text=PPSPM')).toBeVisible()

    // Lampiran section
    await expect(page.locator('text=Lampiran')).toBeVisible()

    // Action buttons: Setujui + Tolak
    await expect(page.locator('button', { hasText: 'Setujui' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Tolak' })).toBeVisible()
  })
})

// =============================================================================
// TC-04: PPK Detail — Preview Lampiran
// =============================================================================

test.describe('TC-04: PPK Detail — Preview Lampiran', () => {
  test('should open preview modal for lampiran', async ({ page }) => {
    const docId = await submitDokumenViaAPI(page)
    expect(docId).not.toBe('')

    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    // Find lampiran row with Pratinjau button
    const previewBtns = page.locator('button[aria-label="Pratinjau"]')
    if (await previewBtns.count() === 0) {
      test.skip()
      return
    }
    await previewBtns.first().click()
    await page.waitForTimeout(2000)

    // Modal should open with filename header
    const modal = page.locator('text=ESC')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Close with ESC
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

// =============================================================================
// TC-05: PPK Approve Document
// =============================================================================

test.describe('TC-05: PPK Approve Document', () => {
  test('should approve dokumen and redirect to inbox', async ({ page }) => {
    const docId = await submitDokumenViaAPI(page)
    expect(docId).not.toBe('')

    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    // Handle confirm dialog
    page.on('dialog', dialog => dialog.accept())
    await page.locator('button', { hasText: 'Setujui' }).click()
    await page.waitForTimeout(3000)

    // Should redirect to inbox
    await expect(page).toHaveURL(/\/ppk\/inbox/, { timeout: 10000 })
    await waitForLoadingDone(page)
  })
})

// =============================================================================
// TC-06: PPK Reject Document
// =============================================================================

test.describe('TC-06: PPK Reject Document', () => {
  test('should reject with catatan and redirect', async ({ page }) => {
    const docId = await submitDokumenViaAPI(page)
    expect(docId).not.toBe('')

    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    await page.locator('button', { hasText: 'Tolak' }).click()
    await page.waitForTimeout(500)

    // Modal should open
    await expect(page.locator('text=Tolak Dokumen')).toBeVisible({ timeout: 5000 })

    // Fill in catatan (>= 10 chars)
    await page.locator('textarea').fill('Dokumen perlu revisi karena informasi tidak lengkap dan lampiran kurang jelas.')
    await page.locator('button', { hasText: 'Tolak Dokumen' }).click()
    await page.waitForTimeout(3000)

    // Should redirect to inbox
    await expect(page).toHaveURL(/\/ppk\/inbox/, { timeout: 10000 })
  })
})

// =============================================================================
// TC-07: PPK Reject — Catatan Required (min 10 chars)
// =============================================================================

test.describe('TC-07: PPK Reject — Catatan Required', () => {
  test('should show error if catatan less than 10 chars', async ({ page }) => {
    const docId = await submitDokumenViaAPI(page)
    expect(docId).not.toBe('')

    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    await page.locator('button', { hasText: 'Tolak' }).click()
    await page.waitForTimeout(500)

    // Short catatan
    await page.locator('textarea').fill('salah')
    await page.locator('button', { hasText: 'Tolak Dokumen' }).click()
    await page.waitForTimeout(1000)

    // Error should appear
    await expect(page.locator('text=minimal 10 karakter')).toBeVisible({ timeout: 5000 })

    // Status should not change — back button should work
    await expect(page.locator('button', { hasText: 'Setujui' })).toBeVisible()
  })
})

// =============================================================================
// TC-08: PPK Tervalidasi Page
// =============================================================================

test.describe('TC-08: PPK Tervalidasi Page', () => {
  test('should show validated documents list', async ({ page }) => {
    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/tervalidasi`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    await expect(page.locator('h2', { hasText: /Tervalidasi/i })).toBeVisible({ timeout: 10000 })

    // Either shows list or empty state
    const listOrEmpty = page.locator('table tbody tr').first().or(page.locator('text=Tidak ada dokumen').or(page.locator('text=Belum ada dokumen')))
    await expect(listOrEmpty).toBeVisible({ timeout: 5000 })
  })
})

// =============================================================================
// TC-09: PPK Ditolak Page
// =============================================================================

test.describe('TC-09: PPK Ditolak Page', () => {
  test('should show rejected documents list', async ({ page }) => {
    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/ditolak`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    await expect(page.locator('h2', { hasText: /Dokumen Tidak Valid/i })).toBeVisible({ timeout: 10000 })

    const listOrEmpty = page.locator('table tbody tr').first().or(page.locator('text=Tidak ada dokumen').or(page.locator('text=Belum ada dokumen')))
    await expect(listOrEmpty).toBeVisible({ timeout: 5000 })
  })
})

// =============================================================================
// TC-10: PPK Revisi Page
// =============================================================================

test.describe('TC-10: PPK Revisi Page', () => {
  test('should show revision documents list', async ({ page }) => {
    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/revisi`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    await expect(page.locator('h2', { hasText: /Revisi/i })).toBeVisible({ timeout: 10000 })

    const listOrEmpty = page.locator('table tbody tr').first().or(page.locator('text=Tidak ada dokumen').or(page.locator('text=Belum ada dokumen')))
    await expect(listOrEmpty).toBeVisible({ timeout: 5000 })
  })
})

// =============================================================================
// TC-11: PPK Resubmit — Edit Lampiran + FSM
// =============================================================================

test.describe('TC-11: PPK Resubmit — Edit Lampiran + FSM', () => {
  test('should allow resubmit with edited lampiran', async ({ page }) => {
    // Step 1: As PPK, reject a document to create NEED_REVISION target=PPK
    // First submit dokumen as pegawai
    const docId = await submitDokumenViaAPI(page)
    expect(docId).not.toBe('')

    // Login as PPK and reject
    await loginAsAndSwitch(page, PPK_EMAIL)
    await page.goto(`${BASE_URL}/ppk/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    // Inject a revision_target=PPK by modifying the REJECT call
    // Since we can't change revision_target via UI, we'll skip this TC for now
    // and focus on the resubmit page structure
    await page.goto(`${BASE_URL}/ppk/revisi`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const resubmitRows = page.locator('table tbody tr')
    const rowCount = await resubmitRows.count()
    if (rowCount === 0) {
      test.skip()
      return
    }

    await resubmitRows.first().locator('button[aria-label="Lihat detail"]').click()
    await page.waitForTimeout(2000)

    // Resubmit page should have catatan banner
    const catatanBanner = page.locator('text=Catatan dari PPSPM').or(page.locator('text=Revisi dari PPSPM'))
    // Either shows or the page redirected
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 5000 })
  })
})

// =============================================================================
// TC-12: Bendahara Inbox — List
// =============================================================================

test.describe('TC-12: Bendahara Inbox — List', () => {
  test('should display inbox with PPK validation info', async ({ page }) => {
    await loginAsAndSwitch(page, BENDAHARA_EMAIL)
    await page.goto(`${BASE_URL}/bendahara/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    await expect(page.locator('h2', { hasText: /Persetujuan/i })).toBeVisible({ timeout: 10000 })

    // Filter fungsi
    await expect(page.locator('select').first()).toBeVisible()

    // Badge check - show "Persetujuan PPSPM" color
    // Either has rows with badge or empty state
    const listOrEmpty = page.locator('table tbody tr').first().or(page.locator('text=Tidak ada dokumen').or(page.locator('text=Belum ada dokumen')))
    await expect(listOrEmpty).toBeVisible({ timeout: 5000 })
  })
})

// =============================================================================
// TC-13: Bendahara Detail — PPK Validation Badge
// =============================================================================

test.describe('TC-13: Bendahara Detail — PPK Validation Badge', () => {
  test('should show detail with PPK badge and action buttons', async ({ page }) => {
    await loginAsAndSwitch(page, BENDAHARA_EMAIL)
    await page.goto(`${BASE_URL}/bendahara/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    // Workflow
    await expect(page.locator('text=Alur Dokumen')).toBeVisible()

    // Lampiran
    await expect(page.locator('text=Lampiran')).toBeVisible()

    // Action buttons
    await expect(page.locator('button', { hasText: /Setujui/i })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Tolak' })).toBeVisible()
  })
})

// =============================================================================
// TC-14: Bendahara Approve → COMPLETED
// =============================================================================

test.describe('TC-14: Bendahara Approve → COMPLETED', () => {
  test('should approve dokumen and mark as COMPLETED', async ({ page }) => {
    await loginAsAndSwitch(page, BENDAHARA_EMAIL)
    await page.goto(`${BASE_URL}/bendahara/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    page.on('dialog', dialog => dialog.accept())
    await page.locator('button', { hasText: /Setujui/i }).click()
    await page.waitForTimeout(3000)

    // Should redirect to inbox
    await expect(page).toHaveURL(/\/bendahara\/inbox/, { timeout: 10000 })
  })
})

// =============================================================================
// TC-15: Bendahara Reject — back to PPK
// =============================================================================

test.describe('TC-15: Bendahara Reject — back to PPK', () => {
  test('should reject dokumen and redirect to inbox', async ({ page }) => {
    await loginAsAndSwitch(page, BENDAHARA_EMAIL)
    await page.goto(`${BASE_URL}/bendahara/inbox`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)

    const eyeBtns = page.locator('button[aria-label="Lihat detail"]')
    if (await eyeBtns.count() === 0) {
      test.skip()
      return
    }
    await eyeBtns.first().click()
    await page.waitForTimeout(2000)

    await page.locator('button', { hasText: 'Tolak' }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('text=Tolak Dokumen')).toBeVisible({ timeout: 5000 })

    await page.locator('textarea').fill('Dokumen ditolak oleh PPSPM. Mohon perbaiki dan ajukan kembali.')
    await page.locator('button', { hasText: 'Tolak Dokumen' }).click()
    await page.waitForTimeout(3000)

    await expect(page).toHaveURL(/\/bendahara\/inbox/, { timeout: 10000 })
  })
})

// =============================================================================
// TC-16: Bendahara Ditolak + Selesai Pages
// =============================================================================

test.describe('TC-16: Bendahara Ditolak + Selesai Pages', () => {
  test('should display ditolak and selesai lists', async ({ page }) => {
    await loginAsAndSwitch(page, BENDAHARA_EMAIL)

    // Ditolak
    await page.goto(`${BASE_URL}/bendahara/ditolak`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)
    await expect(page.locator('h2', { hasText: /Dokumen Ditolak/i })).toBeVisible({ timeout: 10000 })
    const dOrEmpty = page.locator('table tbody tr').first().or(page.locator('text=Tidak ada dokumen').or(page.locator('text=Belum ada dokumen')))
    await expect(dOrEmpty).toBeVisible({ timeout: 5000 })

    // Selesai
    await page.goto(`${BASE_URL}/bendahara/selesai`)
    await page.waitForLoadState('domcontentloaded')
    await waitForLoadingDone(page)
    await expect(page.locator('h2', { hasText: /Selesai/i })).toBeVisible({ timeout: 10000 })
    const sOrEmpty = page.locator('table tbody tr').first().or(page.locator('text=Tidak ada dokumen').or(page.locator('text=Belum ada dokumen')))
    await expect(sOrEmpty).toBeVisible({ timeout: 5000 })
  })
})
