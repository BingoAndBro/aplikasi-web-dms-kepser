"use client"

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  Building2,
  Camera,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Mail,
  Shield,
  Trash2,
  Upload,
  User,
  UsersRound,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { AppDialog } from '#/components/ui/AppDialog'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { Input } from '#/components/ui/input'
import { LoadingState } from '#/components/ui/LoadingState'
import { RoleBadge } from '#/components/ui/RoleBadge'
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
  email: string
  metadata: {
    nama_lengkap?: string
    nip_nrp?: string
    departemen?: string
  }
  roles: RoleName[]
}

type ProfileResponse = {
  user: ProfileUser
  error?: string
}

type KetuaTimResponse = {
  is_ketua_tim?: boolean
  kegiatan?: { id: string; nama: string }[]
}

function getInitials(name?: string, email?: string): string {
  const source = name || email || 'User'
  const parts = source.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.substring(0, 2).toUpperCase()
}

function ProfileInfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-[#FFFDF9] p-4 shadow-sm shadow-orange-950/5">
      <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-outline">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold text-on-surface">
        {value}
      </dd>
    </div>
  )
}

function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [ketuaTimKegiatan, setKetuaTimKegiatan] = useState<{ id: string; nama: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
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
        setError('Gagal memuat Profile')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setPhotoMessage('Pilih file gambar untuk preview foto Profile.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setPhotoPreview(typeof reader.result === 'string' ? reader.result : null)
      setPhotoMessage('Preview foto hanya tersimpan lokal di layar ini dan belum dikirim ke server.')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleRemovePhoto = () => {
    setPhotoPreview(null)
    setPhotoMessage('Preview foto dihapus. Avatar kembali memakai inisial.')
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
        <LoadingState label="Memuat Profile" />
      </PageLayout>
    )
  }

  if (error || !user) {
    return (
      <PageLayout className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
        <ErrorState
          title="Profile tidak dapat dimuat"
          description={error || 'Silakan login ulang jika sesi Anda sudah berakhir.'}
          variant="page"
        />
      </PageLayout>
    )
  }

  const displayName = user.metadata.nama_lengkap || 'Nama belum tersedia'
  const initials = getInitials(user.metadata.nama_lengkap, user.email)

  return (
    <PageLayout className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-orange-100 bg-[#FFFDF9] shadow-xl shadow-orange-950/5">
          <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,rgba(242,92,5,0.13),transparent_22rem),linear-gradient(135deg,#FFFDF9_0%,#FFF5EA_100%)] p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-8">
            <div className="min-w-0 space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                  Profile
                </p>
                <h2 className="mt-2 font-headline text-3xl font-black tracking-tight text-on-surface sm:text-4xl">
                  Kelola identitas akun Anda
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-on-surface-variant">
                  Informasi akun bersifat read-only dari data sistem. Perubahan password tetap memerlukan password saat ini dan akan mengakhiri sesi aktif setelah berhasil.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <RoleBadge key={role} role={role} className="rounded-full px-3 py-1 text-[11px] font-bold" />
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/80 bg-white/85 p-5 text-center shadow-lg shadow-orange-950/5">
              <div className="mx-auto flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-primary text-3xl font-black tracking-wider text-white shadow-md shadow-orange-950/15 ring-1 ring-primary/20">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview foto Profile" className="size-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <h3 className="mt-4 truncate text-lg font-black text-on-surface">{displayName}</h3>
              <p className="truncate text-sm font-medium text-outline">{user.email}</p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />

              <div className="mt-4 grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-orange-200 bg-orange-50 text-primary hover:bg-orange-100"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={15} />
                  {photoPreview ? 'Ganti Foto' : 'Unggah Foto'}
                </Button>
                {photoPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-xl text-error hover:bg-red-50"
                    onClick={handleRemovePhoto}
                  >
                    <Trash2 size={15} />
                    Hapus Foto
                  </Button>
                )}
              </div>
              <p className="mt-3 text-xs font-medium leading-5 text-outline">
                Foto Profile masih preview visual lokal. Belum ada upload backend pada phase ini.
              </p>
              {photoMessage && (
                <p className="mt-2 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900">
                  {photoMessage}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-6">
            <div className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                    Informasi Akun
                  </p>
                  <h3 className="mt-2 text-xl font-black text-on-surface">Data read-only</h3>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Data ini mengikuti catatan akun yang dikelola sistem.
                  </p>
                </div>
                <div className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Terverifikasi sesi
                </div>
              </div>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <ProfileInfoCard icon={<User size={14} />} label="Nama Lengkap" value={displayName} />
                <ProfileInfoCard icon={<Mail size={14} />} label="Email" value={user.email} />
                <ProfileInfoCard icon={<CreditCard size={14} />} label="NIP/NRP" value={user.metadata.nip_nrp || '-'} />
                <ProfileInfoCard icon={<Building2 size={14} />} label="Departemen" value={user.metadata.departemen || '-'} />
              </dl>
            </div>

            <div className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-primary">
                  <UsersRound size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                    Penugasan Ketua Tim
                  </p>
                  <h3 className="mt-2 text-xl font-black text-on-surface">Kegiatan yang dipimpin</h3>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Ditampilkan dari data penugasan yang sudah tersedia di API akun.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                {ketuaTimKegiatan.length > 0 ? (
                  <div className="grid gap-2">
                    {ketuaTimKegiatan.map((kegiatan) => (
                      <div
                        key={kegiatan.id}
                        className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-emerald-950"
                      >
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-700" />
                        <span className="min-w-0 truncate">{kegiatan.nama}</span>
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
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[1.75rem] border border-orange-100 bg-white p-5 shadow-sm shadow-orange-950/5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-orange-50 text-primary">
                  <Shield size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                    Hak Akses
                  </p>
                  <h3 className="text-lg font-black text-on-surface">Role akun</h3>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <RoleBadge key={role} role={role} className="rounded-full px-3 py-1 text-[11px] font-bold" />
                  ))
                ) : (
                  <span className="text-sm font-semibold text-outline">-</span>
                )}
              </div>
              <p className="mt-4 rounded-2xl border border-orange-100 bg-[#FFF8F1] p-3 text-xs font-medium leading-5 text-on-surface-variant">
                Role aktif hanya mengatur pengalaman kerja di UI. Otorisasi tetap diputuskan oleh server melalui sesi.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-orange-100 bg-[#1F1A17] p-5 text-white shadow-lg shadow-orange-950/10">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10 text-orange-100">
                  <KeyRound size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">
                    Keamanan Akun
                  </p>
                  <h3 className="text-lg font-black">Ganti password</h3>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-orange-50/80">
                Gunakan password saat ini, password baru, dan konfirmasi password baru. Setelah berhasil, Anda akan diarahkan untuk login ulang.
              </p>
              <Button
                type="button"
                className="mt-5 w-full rounded-xl bg-white text-[#1F1A17] hover:bg-orange-50"
                onClick={() => {
                  setPasswordError(null)
                  setPasswordDialogOpen(true)
                }}
              >
                <KeyRound size={15} />
                Ganti Password
              </Button>
            </div>
          </aside>
        </div>
      </div>

      <AppDialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open)
          if (!open) setPasswordError(null)
        }}
        title="Ganti Password Profile"
        description="Masukkan password saat ini sebelum membuat password baru. Ini berbeda dari Reset Password Admin Sistem."
        size="md"
        contentClassName="border-orange-100 bg-[#FFFDF9]"
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
