"use client"
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Card, CardHeader, CardTitle, CardContent } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import { User, Mail, CreditCard, Building2, Shield, KeyRound, Loader2, Check } from 'lucide-react'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

// ---------------------------------------------------------------------------
// Role badge colors (same as Master User page)
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<RoleName, string> = {
  PEGAWAI: 'bg-blue-100 text-blue-700 border-blue-200',
  PPK: 'bg-purple-100 text-purple-700 border-purple-200',
  BENDAHARA: 'bg-green-100 text-green-700 border-green-200',
  ARSIPARIS: 'bg-orange-100 text-orange-700 border-orange-200',
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Fetch profile
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/users/me/')
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login'
            return
          }
          const data = await res.json()
          throw new Error(data.error || 'Gagal memuat profil')
        }
        const data = await res.json()
        setUser(data.user)
      } catch (err: any) {
        setError(err.message || 'Gagal memuat profil')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  // ---------------------------------------------------------------------------
  // Change password handler
  // ---------------------------------------------------------------------------

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!passwordForm.currentPassword) {
      setPasswordError('Password lama wajib diisi')
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
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Konfirmasi password tidak cocok')
      return
    }

    setPasswordLoading(true)
    try {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengubah password')
      }
      setPasswordSuccess(true)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err: any) {
      setPasswordError(err.message || 'Gagal mengubah password')
    } finally {
      setPasswordLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-outline" />
        </div>
      </PageLayout>
    )
  }

  if (error || !user) {
    return (
      <PageLayout>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
          {error || 'Gagal memuat profil'}
        </div>
      </PageLayout>
    )
  }

  const initials = (user.metadata.nama_lengkap || user.email)
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Profil Saya</h2>
          <p className="text-on-surface-variant text-sm mt-1">
            Lihat dan kelola informasi akun Anda.
          </p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                <span className="text-xl font-extrabold text-primary">{initials}</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-on-surface">
                  {user.metadata.nama_lengkap || 'Nama tidak tersedia'}
                </h3>
                <p className="text-sm text-on-surface-variant">{user.email}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {user.roles.map(role => (
                    <Badge key={role} className={ROLE_COLORS[role]}>
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={18} />
              Informasi Akun
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-outline font-medium flex items-center gap-1">
                  <Mail size={12} />
                  Email
                </dt>
                <dd className="text-sm text-on-surface mt-1">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-outline font-medium flex items-center gap-1">
                  <CreditCard size={12} />
                  NIP/NRP
                </dt>
                <dd className="text-sm text-on-surface mt-1">{user.metadata.nip_nrp || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-outline font-medium flex items-center gap-1">
                  <Building2 size={12} />
                  Departemen
                </dt>
                <dd className="text-sm text-on-surface mt-1">{user.metadata.departemen || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-outline font-medium flex items-center gap-1">
                  <Shield size={12} />
                  Hak Akses
                </dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {user.roles.length > 0 ? (
                    user.roles.map(role => (
                      <Badge key={role} className={ROLE_COLORS[role]}>
                        {role}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-outline">-</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound size={18} />
              Ganti Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            {passwordSuccess && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
                <Check size={16} />
                Password berhasil diubah
              </div>
            )}

            {passwordError && (
              <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-on-surface mb-1 block">
                  Password Lama
                </label>
                <Input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={e => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="Masukkan password lama"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface mb-1 block">
                  Password Baru
                </label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface mb-1 block">
                  Konfirmasi Password Baru
                </label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Ulangi password baru"
                  autoComplete="new-password"
                />
              </div>
              <div className="pt-2">
                <Button type="submit" disabled={passwordLoading}>
                  {passwordLoading && <Loader2 size={14} className="animate-spin mr-2" />}
                  Simpan Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
