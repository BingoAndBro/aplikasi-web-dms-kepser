import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const confirmDialog = readFileSync('src/components/ui/ConfirmDialog.tsx', 'utf8')
const alertDialog = readFileSync('src/components/ui/alert-dialog.tsx', 'utf8')
const provider = readFileSync('src/components/ui/confirm/ConfirmProvider.tsx', 'utf8')
const rootRoute = readFileSync('src/routes/__root.tsx', 'utf8')
const styles = readFileSync('src/styles.css', 'utf8')

describe('unified ConfirmDialog', () => {
  it('is built on the Base UI AlertDialog primitives', () => {
    expect(alertDialog).toContain('@base-ui/react/alert-dialog')
    expect(confirmDialog).toContain('from "#/components/ui/alert-dialog"')
    expect(confirmDialog).not.toContain('AppDialog')
  })

  it('supports the full tone set with a centred icon badge', () => {
    for (const tone of ['default', 'primary', 'warning', 'destructive', 'success', 'info']) {
      expect(confirmDialog).toContain(`${tone}:`)
    }
    expect(confirmDialog).toContain('rounded-full')
    expect(confirmDialog).toContain('flex flex-col items-center gap-3 text-center')
  })

  it('keeps back-compat props (variant, typedConfirmation, size, trigger, pending)', () => {
    expect(confirmDialog).toContain('VARIANT_TO_TONE')
    expect(confirmDialog).toContain('typedConfirmation')
    expect(confirmDialog).toContain('requireTyped')
    expect(confirmDialog).toContain('withReason')
    expect(confirmDialog).toContain('cancelLabel = "Batal"')
  })

  it('focuses the cancel action first for destructive confirmations', () => {
    expect(confirmDialog).toContain('initialFocus={tone === "destructive" ? cancelRef : undefined}')
  })

  it('does not let Esc / backdrop dismiss a destructive dialog', () => {
    expect(confirmDialog).toContain('dismissAllowed')
    expect(confirmDialog).toContain('escape-key')
    expect(confirmDialog).toContain('outside-press')
  })
})

describe('useConfirm provider', () => {
  it('exposes an imperative confirm() with a FIFO queue', () => {
    expect(provider).toContain('export function ConfirmProvider')
    expect(provider).toContain('export function useConfirm')
    expect(provider).toContain('setQueue((q) => [...q, item])')
    expect(provider).toContain('useConfirm must be used within ConfirmProvider')
  })

  it('is mounted at the app root around AppLayout', () => {
    expect(rootRoute).toContain('<ConfirmProvider>')
    expect(rootRoute).toContain('</ConfirmProvider>')
  })
})

describe('reduced motion', () => {
  it('has a motion-safe rule scoped to the confirm dialog slots', () => {
    expect(styles).toContain('prefers-reduced-motion: reduce')
    expect(styles).toContain('[data-slot="confirm-dialog"]')
    expect(styles).toContain('[data-slot="confirm-overlay"]')
  })
})
