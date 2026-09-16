import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  adminContentCompactClassName,
  adminFormFieldClassName,
  adminFormLabelClassName,
  adminPageContainerClassName,
  adminPrimaryActionClassName,
  AdminConfirmationDialog,
  AdminPageHeader,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { LoadingState } from '#/components/ui/LoadingState'
import { useAppToast } from '#/components/ui/AppToast'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Button } from '#/components/ui/button'
import { Settings as SettingsIcon, Check, Type, LogOut } from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { apiMutation, ApiError } from '#/lib/api-mutation'
import { ROUTES } from '#/lib/constants/routes'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/settings')({
  component: SettingsPage,
})

const THEME_OPTIONS = [
  {
    value: 'se' as const,
    name: 'Sensus Ekonomi (SE)',
    hint: 'Akhiran Tahun 06 - Tema Oranye',
  },
  {
    value: 'sp' as const,
    name: 'Sensus Penduduk (SP)',
    hint: 'Akhiran Tahun 00 - Tema Biru',
  },
  {
    value: 'st' as const,
    name: 'Sensus Pertanian (ST)',
    hint: 'Akhiran Tahun 03 - Tema Hijau',
  },
]

type ThemeValue = (typeof THEME_OPTIONS)[number]['value']

function applyThemeLocally(theme: ThemeValue) {
  if (theme === 'se') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
  try {
    localStorage.setItem('app-theme', theme)
  } catch { /* private mode / storage disabled */ }
  document.cookie = `app-theme=${theme}; path=/; max-age=31536000`
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

type GeneralSettings = { appTitle: string; appSubtitle: string }

type PendingAction =
  | { type: 'theme'; theme: ThemeValue }
  | { type: 'general'; appTitle: string; appSubtitle: string }

function SettingsPage() {
  const { showToast } = useAppToast()
  const [loading, setLoading] = useState(true)
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>('se')

  const [generalLoading, setGeneralLoading] = useState(true)
  const [appTitle, setAppTitle] = useState('')
  const [appSubtitle, setAppSubtitle] = useState('')
  const [savedGeneral, setSavedGeneral] = useState<GeneralSettings>({ appTitle: '', appSubtitle: '' })

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ theme: ThemeValue }>('/settings/theme')
      .then((data) => { if (!cancelled) setCurrentTheme(data.theme) })
      .catch(() => { /* keep default */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiFetch<GeneralSettings>('/settings/general')
      .then((data) => {
        if (cancelled) return
        setAppTitle(data.appTitle)
        setAppSubtitle(data.appSubtitle)
        setSavedGeneral(data)
      })
      .catch(() => { /* keep default */ })
      .finally(() => { if (!cancelled) setGeneralLoading(false) })
    return () => { cancelled = true }
  }, [])

  const isGeneralDirty = appTitle !== savedGeneral.appTitle || appSubtitle !== savedGeneral.appSubtitle

  function requestSaveGeneral() {
    if (!appTitle.trim() || applying) return
    setPendingAction({ type: 'general', appTitle: appTitle.trim(), appSubtitle: appSubtitle.trim() })
  }

  function requestSelectTheme(theme: ThemeValue) {
    if (theme === currentTheme || applying) return
    setPendingAction({ type: 'theme', theme })
  }

  async function handleConfirmPendingAction() {
    if (!pendingAction) return
    setApplying(true)
    try {
      if (pendingAction.type === 'theme') {
        await apiFetch<{ theme: ThemeValue }>('/settings/theme', {
          method: 'PUT',
          body: JSON.stringify({ theme: pendingAction.theme }),
        })
        applyThemeLocally(pendingAction.theme)
      } else {
        await apiFetch<GeneralSettings>('/settings/general', {
          method: 'PUT',
          body: JSON.stringify({ appTitle: pendingAction.appTitle, appSubtitle: pendingAction.appSubtitle }),
        })
      }
      // Every settings change forces a re-login — for this admin tab now,
      // and (via the settings-epoch poll in AppLayout) for every other
      // active session too. See conversation: "kamu akan keluar dari aplikasi".
      try {
        await apiMutation('/auth/logout')
      } catch (err) {
        if (!(err instanceof ApiError)) {
          console.error('Failed to logout after settings change:', err)
        }
      }
      window.location.href = ROUTES.LOGIN
    } catch (err) {
      showToast({ title: 'Gagal', description: getErrorMessage(err, 'Gagal menyimpan perubahan'), variant: 'error' })
      setApplying(false)
      setPendingAction(null)
    }
  }

  return (
    <PageLayout>
      <div className={adminPageContainerClassName}>
        <AdminPageHeader
          className={adminContentCompactClassName}
          icon={<SettingsIcon />}
          eyebrow={<><span>Admin Sistem</span><span>/</span><span>Settings</span></>}
          title="Tema Aplikasi"
          description="Pilih tema visual yang mengikuti event sensus aktif. Perubahan ini berlaku untuk semua pengguna."
        />

        <div className={cn(adminContentCompactClassName, 'space-y-4 rounded-[18px] border border-border-default bg-white p-5')}>
          <div className="flex items-center gap-2">
            <Type size={16} className="text-brand-icon" />
            <p className="text-sm font-extrabold text-text-strong">Identitas Aplikasi</p>
          </div>

          {generalLoading ? (
            <LoadingState variant="list" label="Memuat identitas aplikasi" />
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className={adminFormLabelClassName} htmlFor="app-title">Judul Aplikasi <span className="text-error">*</span></Label>
                <Input
                  id="app-title"
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  placeholder="Contoh: DMS Kepser"
                  maxLength={80}
                  className={adminFormFieldClassName}
                />
                <p className="text-[11px] font-medium text-text-muted">Nama aplikasi, tampil besar di sidebar &amp; header.</p>
              </div>
              <div className="space-y-1.5">
                <Label className={adminFormLabelClassName} htmlFor="app-subtitle">Sub-judul (Nama Sensus Aktif)</Label>
                <Input
                  id="app-subtitle"
                  value={appSubtitle}
                  onChange={(e) => setAppSubtitle(e.target.value)}
                  placeholder="Contoh: Sensus Ekonomi 2026"
                  maxLength={80}
                  className={adminFormFieldClassName}
                />
                <p className="text-[11px] font-medium text-text-muted">Ditampilkan kecil di bawah judul, mengikuti warna tema aktif.</p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={requestSaveGeneral}
                  disabled={!isGeneralDirty || !appTitle.trim() || applying}
                  className={adminPrimaryActionClassName}
                >
                  Simpan Identitas
                </Button>
              </div>
            </>
          )}
        </div>

        <div className={cn(adminContentCompactClassName, 'rounded-[16px] border border-brand-border bg-brand-surface px-4 py-3 text-xs font-semibold text-brand-text-muted')}>
          Perubahan ini berlaku untuk semua pengguna.
        </div>

        {loading ? (
          <LoadingState variant="list" label="Memuat setelan tema" />
        ) : (
          <div className={cn(adminContentCompactClassName, 'grid gap-4 sm:grid-cols-3')}>
            {THEME_OPTIONS.map((option) => {
              const isActive = option.value === currentTheme
              const isSaving = applying && pendingAction?.type === 'theme' && pendingAction.theme === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={applying}
                  onClick={() => requestSelectTheme(option.value)}
                  className={cn(
                    'relative flex flex-col gap-3 rounded-[18px] border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                    isActive
                      ? 'border-brand-border-strong bg-brand-surface-strong shadow-[0_8px_14px_var(--shadow-card)]'
                      : 'border-border-default bg-white hover:border-brand-border',
                  )}
                >
                  {isActive && (
                    <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-brand-solid text-white">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                  <span
                    data-theme={option.value}
                    className="h-10 w-full rounded-[10px] bg-brand-solid"
                  />
                  <div>
                    <p className="text-sm font-bold text-text-strong">{option.name}</p>
                    <p className="mt-0.5 text-xs font-medium text-text-muted">{option.hint}</p>
                  </div>
                  {isSaving && (
                    <span className="text-[11px] font-bold uppercase tracking-wide text-brand-text">Menyimpan...</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <AdminConfirmationDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open && !applying) setPendingAction(null) }}
        title="Simpan perubahan ini?"
        tone="warning"
        icon={<LogOut size={18} />}
        confirmLabel={applying ? 'Menyimpan...' : 'Ya, Simpan'}
        cancelLabel="Batal"
        loading={applying}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmPendingAction}
      >
        {pendingAction?.type === 'theme' && (
          <>Tema aplikasi akan diubah ke <strong className="text-text-strong">{THEME_OPTIONS.find(o => o.value === pendingAction.theme)?.name}</strong> untuk semua pengguna. </>
        )}
        {pendingAction?.type === 'general' && (
          <>Judul &amp; sub-judul aplikasi akan diperbarui untuk semua pengguna. </>
        )}
        <strong className="text-text-strong">Anda akan keluar dari aplikasi</strong> dan perlu masuk kembali setelah ini tersimpan. Pengguna lain yang sedang aktif juga akan diminta keluar dan masuk kembali.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
