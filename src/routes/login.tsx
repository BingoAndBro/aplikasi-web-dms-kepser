import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getBrowserClient } from '#/lib/supabase-browser'
import { getPrimaryRole, getUserRole, ACTIVE_ROLE_COOKIE } from '#/lib/auth'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  // Check for inactive account message from redirect
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const inactiveReason = searchParams.get('reason') === 'inactive'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show inactive message on page load if redirected
  useEffect(() => {
    if (inactiveReason) {
      setError('Akun Anda tidak aktif. Hubungi Administrator.')
      // Clean up URL parameter
      const url = new URL(window.location.href)
      url.searchParams.delete('reason')
      window.history.replaceState({}, '', url.pathname)
    }
  }, [inactiveReason])

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setError(null)

    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      setError(result.error.issues[0].message)
      return
    }

    setIsLoading(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) {
        setError('Terjadi kesalahan saat login. Silakan coba lagi.')
        return
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      })

      if (authError) {
        if (authError.code === 'invalid_credentials' || authError.code === 'user_not_found') {
          setError('Email atau password salah')
        } else if (authError.code === 'email_not_confirmed') {
          setError('Silakan verifikasi email Anda terlebih dahulu. Cek inbox atau folder spam.')
        } else {
          setError('Terjadi kesalahan saat login. Silakan coba lagi.')
        }
        return
      }

      // Login berhasil — check if user is still active
      const { data: statusData } = await supabase
        .from('user_status')
        .select('is_active')
        .eq('user_id', data.user.id)
        .maybeSingle()

      // If is_active is explicitly false, block login
      if (statusData && statusData.is_active === false) {
        // User is inactive, sign out and show error
        await supabase.auth.signOut()
        setError('Akun Anda tidak aktif. Hubungi Administrator.')
        setIsLoading(false)
        return
      }

      // Get roles & set active_role cookie
      const roles = await getUserRole(supabase, data.user.id)
      const primaryRole = getPrimaryRole(roles)

      document.cookie = `${ACTIVE_ROLE_COOKIE}=${primaryRole}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`

      // ADMIN → redirect ke /admin, yang lain ke /
      window.location.href = primaryRole === 'ADMIN' ? '/admin' : '/'
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Mesh Background */}
      <div className="mesh-bg">
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
                Masuk ke Sistem
              </h1>
              <p className="text-on-surface-variant text-xs mt-1 text-center">
                Gunakan akun BPS Anda untuk mengakses DMS
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-error/10 text-error text-xs p-3 rounded-xl border border-error/20 font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-outline uppercase tracking-widest">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="nama@bps.go.id"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
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
