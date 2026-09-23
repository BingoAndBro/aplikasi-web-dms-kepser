"use client"

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  Info,
  LogOut,
  Shield,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { AppDialog } from '#/components/ui/AppDialog'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { Input } from '#/components/ui/input'
import { LoadingState } from '#/components/ui/LoadingState'
import { getRoleBadgeLabel, RoleBadge } from '#/components/ui/RoleBadge'
import { useAppToast } from '#/components/ui/AppToast'
import { UserAvatar } from '#/components/ui/UserAvatar'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { clearClientAuthState } from '#/lib/auth-state'
import { ROUTES } from '#/lib/constants/routes'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

const ACTIVE_ROLE_COOKIE = 'dms_active_role'

interface ProfileUser {
  id: string
  username: string
  email: string | null
  metadata: {
    nama_lengkap?: string
    nip_nrp?: string
    departemen?: string
  }
  roles: RoleName[]
  activeRole?: RoleName
  avatar_url?: string | null
  avatar_mime_type?: 'image/jpeg' | 'image/png' | 'image/webp' | null
  avatar_size_bytes?: number | null
  avatar_updated_at?: string | null
}

type ProfileResponse = {
  user: ProfileUser
  error?: string
}

type KetuaTimResponse = {
  is_ketua_tim?: boolean
  kegiatan?: { id: string; nama: string }[]
}

type AvatarMutationResponse = {
  success: true
  avatar_url: string | null
  avatar_mime_type: ProfileUser['avatar_mime_type']
  avatar_size_bytes: number | null
  avatar_updated_at: string | null
}

const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024
const PROFILE_AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PROFILE_AVATAR_CHANGED_EVENT = 'dms:profile-avatar-changed'

function getInitials(name?: string, username?: string): string {
  const source = name || username || 'User'
  const parts = source.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.substring(0, 2).toUpperCase()
}

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm font-bold leading-5 text-text-strong">
        {value}
      </dd>
    </div>
  )
}

function notifyProfileAvatarChanged() {
  window.dispatchEvent(new Event(PROFILE_AVATAR_CHANGED_EVENT))
}

function getPhotoUploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Koneksi bermasalah. Coba lagi.'
  }

  if (error.status === 401) {
    return 'Sesi Anda berakhir. Silakan masuk kembali.'
  }

  if (error.status === 503) {
    return 'Gagal mengunggah foto profil. Coba lagi atau hubungi Admin Sistem.'
  }

  if (error.status === 400) {
    const message = error.message.toLowerCase()

    if (message.includes('ukuran') || message.includes('2mb') || message.includes('2 mb')) {
      return 'Ukuran foto terlalu besar. Maksimal 2 MB.'
    }

    if (message.includes('tipe') || message.includes('format') || message.includes('extension')) {
      return 'Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.'
    }

    if (message.includes('valid') || message.includes('signature')) {
      return 'File foto tidak valid. Pilih gambar lain.'
    }
  }

  return 'Gagal mengunggah foto profil. Coba lagi.'
}

function getPhotoRemoveErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Koneksi bermasalah. Coba lagi.'
  }

  if (error.status === 401) {
    return 'Sesi Anda berakhir. Silakan masuk kembali.'
  }

  if (error.status === 503) {
    return 'Gagal menghapus foto profil. Coba lagi atau hubungi Admin Sistem.'
  }

  return 'Gagal menghapus foto profil. Coba lagi.'
}

function ProfilePage() {
  const { showToast } = useAppToast()
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [ketuaTimKegiatan, setKetuaTimKegiatan] = useState<{ id: string; nama: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState<string | null>(null)
  const [pendingPhotoError, setPendingPhotoError] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError(null)
      try {
        const [profileData, ketuaTimData] = await Promise.all([
          apiFetch<ProfileResponse>('/users/me/'),
          apiFetch<KetuaTimResponse>('/users/me/ketua-tim').catch(() => ({ kegiatan: [] })),
        ])

        setUser(profileData.user)
        setKetuaTimKegiatan(ketuaTimData.kegiatan || [])
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = ROUTES.LOGIN
          return
        }
        setError('Gagal memuat Profil Saya')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  useEffect(() => {
    return () => {
      if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl)
    }
  }, [pendingPhotoPreviewUrl])

  const resetPendingPhoto = () => {
    if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl)
    setPendingPhotoFile(null)
    setPendingPhotoPreviewUrl(null)
    setPendingPhotoError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openPhotoDialog = () => {
    resetPendingPhoto()
    setPhotoDialogOpen(true)
  }

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPendingPhotoError(null)

    if (!PROFILE_AVATAR_ALLOWED_TYPES.has(file.type)) {
      setPendingPhotoError('Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.')
      event.target.value = ''
      return
    }

    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
      setPendingPhotoError('Ukuran foto terlalu besar. Maksimal 2 MB.')
      event.target.value = ''
      return
    }

    if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl)
    setPendingPhotoFile(file)
    setPendingPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const handleSavePhoto = async () => {
    if (!pendingPhotoFile) {
      setPendingPhotoError('Pilih file foto terlebih dahulu.')
      return
    }

    const formData = new FormData()
    formData.append('file', pendingPhotoFile)

    setPhotoLoading(true)
    setPendingPhotoError(null)
    try {
      const result = await apiMutation<AvatarMutationResponse>('/api/users/me?avatar=1', {
        method: 'POST',
        body: formData,
      })
      setUser((current) => current ? {
        ...current,
        avatar_url: result.avatar_url,
        avatar_mime_type: result.avatar_mime_type,
        avatar_size_bytes: result.avatar_size_bytes,
        avatar_updated_at: result.avatar_updated_at,
      } : current)
      notifyProfileAvatarChanged()
      showToast({
        title: 'Berhasil',
        description: 'Foto profil berhasil diperbarui.',
        variant: 'success',
      })
      setPhotoDialogOpen(false)
      resetPendingPhoto()
    } catch (err) {
      const message = getPhotoUploadErrorMessage(err)
      setPendingPhotoError(message)
      showToast({
        title: 'Gagal',
        description: message,
        variant: 'error',
      })
    } finally {
      setPhotoLoading(false)
    }
  }

  const handleRemovePhoto = async () => {
    setPhotoLoading(true)
    try {
      const result = await apiMutation<AvatarMutationResponse>('/api/users/me?avatar=1', {
        method: 'DELETE',
      })
      setUser((current) => current ? {
        ...current,
        avatar_url: result.avatar_url,
        avatar_mime_type: result.avatar_mime_type,
        avatar_size_bytes: result.avatar_size_bytes,
        avatar_updated_at: result.avatar_updated_at,
      } : current)
      notifyProfileAvatarChanged()
      showToast({
        title: 'Berhasil',
        description: 'Foto profil berhasil dihapus.',
        variant: 'success',
      })
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: getPhotoRemoveErrorMessage(err),
        variant: 'error',
      })
    } finally {
      setPhotoLoading(false)
    }
  }

  const handleLogout = async () => {
    setLogoutLoading(true)
    try {
      await apiMutation('/auth/logout')
      clearClientAuthState('unauthenticated', true)
      document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0`
      window.location.href = ROUTES.LOGIN
    } catch (err) {
      if (err instanceof ApiError) {
        showToast({
          title: 'Gagal',
          description: err.message || 'Gagal keluar dari akun.',
          variant: 'error',
        })
      } else {
        showToast({
          title: 'Gagal',
          description: 'Gagal keluar dari akun.',
          variant: 'error',
        })
      }
    } finally {
      setLogoutLoading(false)
    }
  }

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)

    if (!passwordForm.currentPassword) {
      setPasswordError('Password saat ini wajib diisi')
      return
    }
    if (!passwordForm.newPassword) {
      setPasswordError('Password baru wajib diisi')
      return
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password baru minimal 8 karakter')
      return
    }
    if (!passwordForm.confirmPassword) {
      setPasswordError('Konfirmasi password wajib diisi')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Konfirmasi password tidak cocok')
      return
    }

    setPasswordLoading(true)
    try {
      await apiMutation('/api/users/me/change-password', {
        method: 'POST',
        body: {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        },
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      clearClientAuthState('unauthenticated', true)
      document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0`
      window.location.href = `${ROUTES.LOGIN}?password_changed=1`
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setPasswordError(
          payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error || 'Gagal mengubah password'
            : 'Gagal mengubah password',
        )
        return
      }

      setPasswordError('Gagal mengubah password')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (loading) {
    return (
      <PageLayout className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
        <LoadingState label="Memuat Profil Saya" />
      </PageLayout>
    )
  }

  if (error || !user) {
    return (
      <PageLayout className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="Profil Saya tidak dapat dimuat"
          description={error || 'Silakan login ulang jika sesi Anda sudah berakhir.'}
          variant="page"
        />
      </PageLayout>
    )
  }

  const displayName = user.metadata.nama_lengkap || 'Nama belum tersedia'
  const initials = getInitials(user.metadata.nama_lengkap, user.username)
  const activeRole = user.activeRole ?? user.roles[0]
  const activeRoleLabel = activeRole ? getRoleBadgeLabel(activeRole) : '-'
  return (
    <PageLayout className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-6 lg:px-10">
      <div className="space-y-6">
        <section className="pt-1">
          <h1 className="font-headline text-[32px] font-black leading-none tracking-tight text-text-strong sm:text-[38px]">
            Profil Saya
          </h1>
          <p className="mt-2.5 max-w-3xl text-base font-medium leading-6 text-brand-text-muted">
            Kelola informasi akun, foto profil, dan keamanan password Anda.
          </p>
        </section>

        <div className="grid gap-7 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[24px] border border-brand-border bg-white text-center shadow-[0_1px_8px_rgba(71,50,22,0.14)]">
              <div className="h-[94px] bg-brand-surface-strong" />
              <div className="-mt-16 px-8 pb-6">
                <UserAvatar
                  src={user.avatar_url}
                  alt={`Foto profil ${displayName}`}
                  initials={initials}
                  className="mx-auto size-28 border-[5px] border-white bg-brand-solid text-[36px] shadow-sm ring-1 ring-brand-gradient-to/45"
                />

                <h2 className="mt-7 truncate text-[24px] font-black leading-tight text-text-strong">{displayName}</h2>
                <p className="mt-2 truncate text-[15px] font-medium text-text-muted">@{user.username}</p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Akun Aktif
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />

              <div className="grid gap-3 px-8 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[16px] border-brand-border-strong bg-bg-surface text-sm font-bold text-brand-text shadow-none hover:bg-brand-surface-strong"
                  disabled={photoLoading}
                  onClick={openPhotoDialog}
                >
                  <Upload size={15} />
                  {user.avatar_url ? 'Ganti Foto' : 'Unggah Foto'}
                </Button>
                {user.avatar_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-[16px] border border-red-200 bg-red-50 text-sm font-bold text-danger-text shadow-none hover:bg-red-100"
                    disabled={photoLoading}
                    onClick={handleRemovePhoto}
                  >
                    <Trash2 size={15} />
                    Hapus Foto
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[16px] border-red-200 bg-red-50 text-sm font-bold text-danger-text shadow-none hover:bg-red-100"
                  disabled={logoutLoading}
                  onClick={handleLogout}
                >
                  <LogOut size={15} />
                  {logoutLoading ? 'Signing out...' : 'Sign Out'}
                </Button>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[24px] border border-brand-border bg-white p-6 shadow-[0_1px_8px_rgba(71,50,22,0.12)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-info-surface text-info-text">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-text-strong">Keamanan Akun</h3>
                    <p className="mt-0.5 text-xs font-semibold text-text-muted">
                      Ubah password akun Anda secara mandiri.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="h-11 rounded-2xl border border-ink-border bg-ink-solid px-6 text-sm font-black text-white shadow-[0_2px_0_rgba(0,0,0,0.45)] hover:bg-ink-solid-hover"
                  onClick={() => {
                    setPasswordError(null)
                    setPasswordDialogOpen(true)
                  }}
                >
                  Reset Password
                </Button>
              </div>
            </section>

            <div className="rounded-[24px] border border-brand-border bg-white p-6 shadow-[0_1px_8px_rgba(71,50,22,0.12)]">
              <h3 className="text-base font-black text-text-strong">Informasi Akun</h3>
              <div className="mt-2.5 border-t border-info-border" />

              <dl className="mt-5 grid gap-x-16 gap-y-5 sm:grid-cols-2">
                <InfoField label="Nama Lengkap" value={displayName} />
                <InfoField label="Username" value={user.username} />
                <InfoField label="Email" value={user.email ?? '-'} />
                <InfoField label="NIP/NRP" value={user.metadata.nip_nrp || '-'} />
                <InfoField label="Fungsi/Departemen" value={user.metadata.departemen || '-'} />
              </dl>
              <p className="mt-7 flex items-center gap-1.5 border-t border-info-border pt-4 text-[11px] font-medium text-text-muted">
                <Info size={13} />
                Perubahan data utama akun dikelola oleh Admin Sistem.
              </p>
            </div>

            <div className="rounded-[24px] border border-brand-border bg-white p-6 shadow-[0_1px_8px_rgba(71,50,22,0.12)]">
              <h3 className="text-base font-black text-text-strong">Hak Akses</h3>
              <div className="mt-2.5 border-t border-info-border" />
              <p className="mt-5 text-sm font-medium text-info-text">
                Role aktif saat ini: <span className="font-bold text-text-strong">{activeRoleLabel}</span>
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <RoleBadge key={role} role={role} className="rounded-[9px] px-3 py-1 text-xs font-bold" />
                  ))
                ) : (
                  <span className="text-sm font-semibold text-outline">-</span>
                )}
              </div>
              <p className="mt-5 text-sm font-medium leading-6 text-info-text">
                Anda memiliki {user.roles.length || 0} hak akses yang dikelola oleh Admin Sistem.
              </p>
              <p className="mt-5 flex items-center gap-1.5 border-t border-info-border pt-4 text-[11px] font-medium text-text-muted">
                <Info size={13} />
                Hak akses ditentukan oleh Admin Sistem.
              </p>
            </div>

            <div className="rounded-[24px] border border-brand-border bg-white p-6 shadow-[0_1px_8px_rgba(71,50,22,0.12)]">
              <h3 className="text-base font-black text-text-strong">Penugasan</h3>
              <div className="mt-2.5 border-t border-info-border" />

              <div className="mt-5">
                {ketuaTimKegiatan.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {ketuaTimKegiatan.map((kegiatan) => (
                      <div
                        key={kegiatan.id}
                        className="rounded-[5px] border border-info-border bg-info-surface px-2.5 py-1 text-xs font-black uppercase text-text-strong"
                      >
                        {kegiatan.nama}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<UsersRound size={18} />}
                    title="Belum ada penugasan Ketua Tim"
                    description="Jika Anda ditetapkan sebagai Ketua Tim, daftar kegiatan akan muncul di sini."
                  />
                )}
              </div>
              {ketuaTimKegiatan.length > 0 && (
                <p className="mt-4 text-xs font-medium leading-5 text-info-text">
                  Kegiatan yang Anda pimpin sebagai Ketua Tim.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <AppDialog
        open={photoDialogOpen}
        onOpenChange={(open) => {
          if (photoLoading) return
          setPhotoDialogOpen(open)
          if (!open) resetPendingPhoto()
        }}
        title={user.avatar_url ? 'Ganti Foto Profil' : 'Unggah Foto Profil'}
        size="md"
        showCloseButton={!photoLoading}
        contentClassName="border-brand-border bg-white"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-2xl px-5"
              disabled={photoLoading}
              onClick={() => {
                setPhotoDialogOpen(false)
                resetPendingPhoto()
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="h-10 rounded-2xl bg-brand-solid px-6 text-white hover:bg-brand-solid-hover"
              disabled={photoLoading || !pendingPhotoFile}
              onClick={handleSavePhoto}
            >
              {photoLoading ? 'Menyimpan...' : 'Simpan Foto'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center px-6 pb-7 pt-6 text-center">
          <UserAvatar
            src={pendingPhotoPreviewUrl ?? user.avatar_url}
            alt="Preview foto profil"
            initials={initials}
            className="size-28 border-[5px] border-white bg-brand-solid text-[36px] shadow-sm ring-1 ring-brand-gradient-to/45"
          />

          <Button
            type="button"
            variant="outline"
            className="mt-5 h-10 rounded-2xl border-brand-border-strong bg-bg-surface px-5 text-sm font-bold text-brand-text shadow-none hover:bg-brand-surface-strong"
            disabled={photoLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={15} />
            Pilih File
          </Button>

          <p className="mt-4 text-sm font-semibold text-info-text">
            JPG, PNG, atau WebP • Maks. 2 MB
          </p>
          <p className="mt-1 text-xs font-medium text-text-muted">
            Foto akan digunakan di topbar dan menu akun.
          </p>

          {pendingPhotoFile && (
            <p className="mt-3 max-w-full truncate rounded-full border border-info-border bg-info-surface px-3 py-1 text-xs font-semibold text-info-text">
              {pendingPhotoFile.name}
            </p>
          )}

          {pendingPhotoError && (
            <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              {pendingPhotoError}
            </p>
          )}
        </div>
      </AppDialog>

      <AppDialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open)
          if (!open) setPasswordError(null)
        }}
        title="Ganti Password Profil Saya"
        description="Masukkan password saat ini sebelum membuat password baru. Ini berbeda dari Reset Password Admin Sistem."
        size="md"
        contentClassName="border-brand-border bg-bg-surface"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={passwordLoading}
              onClick={() => setPasswordDialogOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" form="profile-password-form" disabled={passwordLoading}>
              {passwordLoading ? 'Menyimpan...' : 'Simpan Password'}
            </Button>
          </>
        }
      >
        <form id="profile-password-form" onSubmit={handlePasswordChange} className="space-y-4">
          {passwordError && (
            <ErrorState
              title="Password belum dapat diubah"
              description={passwordError}
              variant="destructive"
              className="shadow-none"
            />
          )}

          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-on-surface">
              Password Saat Ini
            </label>
            <Input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              placeholder="Masukkan password saat ini"
              autoComplete="current-password"
              disabled={passwordLoading}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-on-surface">
              Password Baru
            </label>
            <Input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              placeholder="Minimal 8 karakter"
              autoComplete="new-password"
              disabled={passwordLoading}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-on-surface">
              Konfirmasi Password Baru
            </label>
            <Input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              placeholder="Ulangi password baru"
              autoComplete="new-password"
              disabled={passwordLoading}
            />
          </div>
        </form>
      </AppDialog>
    </PageLayout>
  )
}
