import { LogOut } from 'lucide-react'
import { Button } from '#/components/ui/button'

/**
 * Fase 8: blocking, non-dismissable overlay shown to every session (including
 * the admin's own other tabs) once AppLayout's settings-epoch poll detects
 * that an admin changed tema/judul/sub-judul somewhere else. No auto-logout —
 * the user must press OK themselves; until then the app underneath is inert.
 */
export function SettingsChangedOverlay({ onConfirm, loading }: { onConfirm: () => void; loading: boolean }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="settings-changed-title"
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-[22px] border border-brand-border bg-white p-6 text-center shadow-2xl shadow-black/20">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-surface text-brand-icon">
          <LogOut size={22} />
        </div>
        <h2 id="settings-changed-title" className="mt-4 text-base font-extrabold text-text-strong">
          Terdapat Perubahan Pengaturan Aplikasi
        </h2>
        <p className="mt-2 text-sm font-medium leading-relaxed text-text-muted">
          Anda harus keluar dari aplikasi terlebih dahulu, lalu masuk kembali untuk melanjutkan.
        </p>
        <Button
          onClick={onConfirm}
          disabled={loading}
          className="mt-5 h-11 w-full rounded-[16px] bg-brand-solid text-sm font-extrabold text-white hover:bg-brand-solid-hover"
        >
          {loading ? 'Memproses...' : 'OK, Keluar Sekarang'}
        </Button>
      </div>
    </div>
  )
}
