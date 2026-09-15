import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  adminContentCompactClassName,
  adminPageContainerClassName,
  AdminPageHeader,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { LoadingState } from '#/components/ui/LoadingState'
import { useAppToast } from '#/components/ui/AppToast'
import { Settings as SettingsIcon, Check } from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError } from '#/lib/api-mutation'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/settings')({
  component: SettingsPage,
})

const THEME_OPTIONS = [
  {
    value: 'se' as const,
    name: 'Sensus Ekonomi (SE)',
    hint: 'Tema oranye — identitas aplikasi saat ini.',
  },
  {
    value: 'sp' as const,
    name: 'Sensus Penduduk (SP)',
    hint: 'Tema biru.',
  },
  {
    value: 'st' as const,
    name: 'Sensus Pertanian (ST)',
    hint: 'Tema hijau.',
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

function SettingsPage() {
  const { showToast } = useAppToast()
  const [loading, setLoading] = useState(true)
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>('se')
  const [saving, setSaving] = useState<ThemeValue | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ theme: ThemeValue }>('/settings/theme')
      .then((data) => { if (!cancelled) setCurrentTheme(data.theme) })
      .catch(() => { /* keep default */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleSelect(theme: ThemeValue) {
    if (theme === currentTheme || saving) return
    setSaving(theme)
    try {
      await apiFetch<{ theme: ThemeValue }>('/settings/theme', {
        method: 'PUT',
        body: JSON.stringify({ theme }),
      })
      setCurrentTheme(theme)
      applyThemeLocally(theme)
      showToast({
        title: 'Tema diperbarui',
        description: `Tema aplikasi diubah ke ${THEME_OPTIONS.find(o => o.value === theme)?.name}.`,
        variant: 'success',
      })
    } catch (err) {
      showToast({ title: 'Gagal', description: getErrorMessage(err, 'Gagal menyimpan tema'), variant: 'error' })
    } finally {
      setSaving(null)
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

        <div className={cn(adminContentCompactClassName, 'rounded-[16px] border border-brand-border bg-brand-surface px-4 py-3 text-xs font-semibold text-brand-text-muted')}>
          Perubahan ini berlaku untuk semua pengguna.
        </div>

        {loading ? (
          <LoadingState variant="list" label="Memuat setelan tema" />
        ) : (
          <div className={cn(adminContentCompactClassName, 'grid gap-4 sm:grid-cols-3')}>
            {THEME_OPTIONS.map((option) => {
              const isActive = option.value === currentTheme
              const isSaving = saving === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={saving !== null}
                  onClick={() => handleSelect(option.value)}
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
    </PageLayout>
  )
}
