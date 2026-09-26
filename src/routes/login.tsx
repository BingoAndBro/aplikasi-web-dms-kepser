import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { setClientAuthState } from '#/lib/auth-state'
import { getDefaultRouteForRoles } from '#/lib/constants/routes'
import { loginSchema } from '#/lib/schemas/auth'
import type { RoleName } from '#/lib/types/auth'

type LoginResponse = {
  user: {
    id: string
    username: string
    displayName?: string
  }
  roles: RoleName[]
  activeRole: RoleName
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  // Check for inactive account message from redirect
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const inactiveReason = searchParams.get('reason') === 'inactive'
  const passwordChanged = searchParams.get('password_changed') === '1'

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Show inactive message on page load if redirected
  useEffect(() => {
    const url = new URL(window.location.href)
    let shouldCleanUrl = false

    if (inactiveReason) {
      setError('Akun Anda tidak aktif. Hubungi Administrator.')
      url.searchParams.delete('reason')
      shouldCleanUrl = true
    }

    if (passwordChanged) {
      setSuccessMessage('Password berhasil diubah. Silakan login ulang.')
      url.searchParams.delete('password_changed')
      shouldCleanUrl = true
    }

    if (shouldCleanUrl) {
      const search = url.searchParams.toString()
      window.history.replaceState({}, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`)
    }
  }, [inactiveReason, passwordChanged])

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const result = loginSchema.safeParse({ identifier, password })
    if (!result.success) {
      setError(result.error.issues[0].message)
      return
    }

    setIsLoading(true)
    try {
      const data = await apiMutation<LoginResponse>('/auth/login', {
        body: {
          identifier: result.data.identifier,
          password: result.data.password,
        },
      })

      setClientAuthState({
        status: 'authenticated',
        userId: data.user.id,
        username: data.user.username,
        roles: data.roles,
        activeRole: data.activeRole,
        isReady: true,
      })

      window.location.href = getDefaultRouteForRoles(data.roles, data.activeRole)

    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.status === 401 ? 'Username/NIP atau password salah' : error.message)
        return
      }

      setError('Terjadi kesalahan saat login. Silakan coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Mesh Background */}
      <div
        className="mesh-bg"
        style={{
          backgroundImage: 'radial-gradient(circle at bottom left, color-mix(in srgb, var(--brand-solid) 45%, transparent), transparent 32rem)',
        }}
      >
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
      </div>

      <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-surface-container-lowest/80 backdrop-blur-2xl border border-outline-variant/20 rounded-2xl shadow-2xl shadow-primary/5 p-8">
            {/* Logo + Header */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-lg shadow-primary/10 flex items-center justify-center mb-4">
                <img src="/bps-logo.png" alt="BPS Logo" className="w-12 h-12 object-contain" />
              </div>
              <p className="text-primary font-black text-[10px] uppercase tracking-[0.25em] mb-1">
                BPS Kabupaten Kepulauan Seribu
              </p>
              <h1 className="font-headline text-2xl font-extrabold text-on-surface tracking-tight">
                Masuk ke DMS Kepser
              </h1>
              <p className="text-on-surface-variant text-xs mt-1.5 text-center">
                Sistem Manajemen Dokumen BPS Kabupaten Kepulauan Seribu
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-error/10 text-error text-xs p-3 rounded-xl border border-error/20 font-medium">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="bg-green-500/10 text-green-700 text-xs p-3 rounded-xl border border-green-500/20 font-medium">
                  {successMessage}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-outline uppercase tracking-widest">
                  Username atau NIP
                </label>
                <input
                  type="text"
                  placeholder="Masukkan username/NIP"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                  className="w-full px-4 py-3 bg-surface-container/40 border border-outline-variant/30 rounded-xl text-sm text-on-surface placeholder:text-outline/40 focus:ring-2 focus:ring-primary/40 focus:border-primary/40 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-outline uppercase tracking-widest">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-surface-container/40 border border-outline-variant/30 rounded-xl text-sm text-on-surface placeholder:text-outline/40 focus:ring-2 focus:ring-primary/40 focus:border-primary/40 outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-primary text-white rounded-xl font-extrabold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none animate-breath"
              >
                {isLoading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>

            <p className="text-center text-[10px] text-outline font-bold uppercase tracking-widest mt-6">
              Hubungi Administrator jika belum memiliki akun
            </p>
          </div>

          <p className="text-center text-[10px] text-outline font-bold uppercase tracking-widest mt-6">
            © {new Date().getFullYear()} BPS Kabupaten Kepulauan Seribu
          </p>
        </div>
      </div>
    </>
  )
}
