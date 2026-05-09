import * as React from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Settings,
  LogOut,
  Search,
  Bell,
  ChevronDown,
  UserCircle,
} from 'lucide-react'

import { getBrowserClient } from '#/lib/supabase-browser'
import { ACTIVE_ROLE_COOKIE, getPrimaryRole } from '#/lib/auth'
import { MESH_ROUTES, ROLE_DEFAULT_ROUTE, ROUTES } from '#/lib/constants/routes'
import { ROLES } from '#/lib/constants/roles'

import type { RoleName } from '#/lib/types/auth'
import { ROLE_DISPLAY } from '#/lib/types/auth'
import { AppSidebar } from './AppSidebar'

function clearAppState() {
  document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0`
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }
  if (email) return email.substring(0, 2).toUpperCase()
  return '??'
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const routerState = useRouterState()

  const [userRoles, setUserRoles] = React.useState<RoleName[]>([])
  const [activeRole, setActiveRole] = React.useState<RoleName>(ROLES.PEGAWAI)
  const [userName, setUserName] = React.useState<string | undefined>()
  const [email, setEmail] = React.useState<string | undefined>()
  const [isLoading, setIsLoading] = React.useState(true)
  const [chairmanKegiatan, setChairmanKegiatan] = React.useState<{ id: string; nama: string }[]>([])

  const fetchChairmanStatus = React.useCallback(async (session: any) => {
    if (!session) return
    try {
      const res = await fetch('/api/users/me/ketua-tim', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setChairmanKegiatan(data.kegiatan || [])
      }
    } catch (err) {
      console.error('Failed to fetch chairman status:', err)
    }
  }, [])
  const [hasSession, setHasSession] = React.useState(false)
  const [roleSwitcherOpen, setRoleSwitcherOpen] = React.useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false)

  const supabase = React.useMemo(() => getBrowserClient(), [])

  const pathname = routerState.location.pathname
  const isMeshPage = MESH_ROUTES.includes(pathname)
  const isLoginPage = pathname === ROUTES.LOGIN

  const fetchSession = React.useCallback(async () => {
    if (!supabase) { setIsLoading(false); setHasSession(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setIsLoading(false); setHasSession(false); return }

    await supabase.auth.getUser()

    const { data: statusData } = await supabase
      .from('user_status')
      .select('is_active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (statusData && statusData.is_active === false) {
      await supabase.auth.signOut()
      setUserRoles([]); setActiveRole(ROLES.PEGAWAI)
      setUserName(undefined); setEmail(undefined)
      setHasSession(false); clearAppState()
      window.location.href = `${ROUTES.LOGIN}?reason=inactive`
      return
    }

    setHasSession(true)
    setUserName(session.user.user_metadata?.user_name as string | undefined)
    setEmail(session.user.email ?? undefined)

    let isChairman = false
    try {
      const ktRes = await fetch('/api/users/me/ketua-tim', { credentials: 'include' })
      if (ktRes.ok) {
        const ktData = await ktRes.json()
        setChairmanKegiatan(ktData.kegiatan || [])
        isChairman = (ktData.kegiatan || []).length > 0
      }
    } catch (err) {
      console.error('Failed to fetch chairman status:', err)
    }

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role:roles(nama)')
      .eq('user_id', session.user.id)

    const roleNames = (rolesData ?? [])
      .map((r: { role?: { nama?: RoleName } }) => r.role?.nama)
      .filter((n: any): n is RoleName => n !== undefined && n !== null)

    setUserRoles(roleNames)

    const cookieRole = document.cookie
      .split('; ')
      .find(c => c.startsWith(`${ACTIVE_ROLE_COOKIE}=`))
      ?.split('=')[1] as RoleName | undefined

    const effectiveRole = cookieRole && roleNames.includes(cookieRole)
      ? cookieRole
      : getPrimaryRole(roleNames)

    setActiveRole(effectiveRole)
    setIsLoading(false)
  }, [supabase])

  React.useEffect(() => {
    fetchSession()
    const supabase = getBrowserClient()
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: ReturnType<typeof supabase.auth.getSession>['data']) => {
      if (event === 'SIGNED_OUT') {
        setUserRoles([]); setActiveRole(ROLES.PEGAWAI)
        setUserName(undefined); setEmail(undefined)
        setHasSession(false); setChairmanKegiatan([])
        clearAppState()
        if (!isLoginPage) {
          window.location.href = ROUTES.LOGIN
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchSession()
      }
    })
    return () => { subscription.unsubscribe() }
  }, [fetchSession, isLoginPage])

  React.useEffect(() => {
    if (!isLoading && !hasSession && !isLoginPage) {
      window.location.href = ROUTES.LOGIN
    }
  }, [isLoading, hasSession, isLoginPage])

  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ACTIVE_ROLE_COOKIE) {
        const newRole = e.newValue as RoleName | null
        if (newRole && userRoles.includes(newRole)) setActiveRole(newRole)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [userRoles, chairmanKegiatan])

  const handleRoleSwitch = (newRole: RoleName) => {
    document.cookie = `${ACTIVE_ROLE_COOKIE}=${newRole}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    window.location.href = ROLE_DEFAULT_ROUTE[newRole]
  }

  const handleLogout = async () => {
    setIsLoading(true)
    setUserRoles([]); setActiveRole(ROLES.PEGAWAI)
    setUserName(undefined); setEmail(undefined)
    setHasSession(false); clearAppState()
    const supabase = getBrowserClient()
    if (supabase) await supabase.auth.signOut()
    navigate({ to: ROUTES.LOGIN })
  }

  const isAdmin = activeRole === ROLES.ADMIN
  const initials = getInitials(userName, email)
  const displayName = userName || email?.split('@')[0] || 'User'
  const canSwitchRole = userRoles.length > 1 && !isAdmin

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-on-surface-variant">Memuat...</span>
        </div>
      </div>
    )
  }

  if (!hasSession && !isLoginPage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-on-surface-variant">Mengalihkan ke login...</span>
        </div>
      </div>
    )
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <>
      {isMeshPage && (
        <div className="mesh-bg">
          <div className="mesh-blob mesh-blob-1" />
          <div className="mesh-blob mesh-blob-2" />
          <div className="mesh-blob mesh-blob-3" />
        </div>
      )}

      <div className="flex h-screen overflow-hidden bg-background relative selection:bg-primary-container selection:text-on-primary-container">
        <AppSidebar
          activeRole={activeRole}
          pathname={routerState.location.pathname}
          searchStr={routerState.location.searchStr}
          onLogout={handleLogout}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-20 flex justify-between items-center px-10 bg-background/60 backdrop-blur-xl border-b border-outline-variant/10 z-40">
            <div className="flex items-center gap-12 flex-1">
              <div className="flex items-center gap-4">
                {isAdmin ? (
                  <span className="text-xl font-extrabold tracking-tight text-primary shrink-0">Admin Curator</span>
                ) : (
                  <h2 className="text-2xl font-black tracking-tighter text-on-surface font-headline shrink-0">
                    {ROLE_DISPLAY[activeRole]}
                  </h2>
                )}
              </div>

              <div className="relative group flex-1 max-w-2xl">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-outline/40">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder={isAdmin ? 'Quick search users...' : 'Search documents, archives, or tasks...'}
                  className="pl-14 pr-6 py-3.5 bg-surface-container/30 border border-outline-variant/20 rounded-2xl w-full text-sm focus:ring-2 focus:ring-primary/40 focus:bg-surface-container placeholder:text-outline/40 outline-none transition-all shadow-inner group-hover:border-outline-variant/40"
                />
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-5">
                <button className="text-outline hover:text-primary hover:bg-primary/5 p-2.5 rounded-xl transition-all relative">
                  <Bell size={22} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background" />
                </button>
                <button className="text-outline hover:text-primary hover:bg-primary/5 p-2.5 rounded-xl transition-all">
                  <Settings size={22} />
                </button>
              </div>

              <div className="flex items-center gap-4 pl-8 border-l border-outline-variant/10 relative">
                {canSwitchRole && (
                  <div className="flex flex-col items-end mr-2 relative">
                    <label className="text-[8px] font-black text-outline uppercase tracking-[0.2em] mb-1">Switch Role</label>
                    <button
                      onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
                      className="bg-surface-container/50 border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest px-2 py-1 outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer hover:bg-surface-container transition-all flex items-center gap-1"
                    >
                      {activeRole}
                      <ChevronDown size={10} className={`transition-transform ${roleSwitcherOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {roleSwitcherOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setRoleSwitcherOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-lg shadow-xl py-1 min-w-[160px]">
                          {userRoles.map((role) => (
                            <button
                              key={role}
                              onClick={() => handleRoleSwitch(role)}
                              className={`w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                role === activeRole
                                  ? 'bg-primary text-white'
                                  : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
                              }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-on-surface uppercase tracking-wider">{displayName}</p>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                    {isAdmin ? 'Super Administrator' : ROLE_DISPLAY[activeRole]}
                  </p>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="w-11 h-11 rounded-2xl bg-primary/10 p-0.5 shadow-xl cursor-pointer hover:bg-primary/20 transition-all"
                  >
                    <div className="w-full h-full rounded-[14px] bg-primary flex items-center justify-center border-2 border-background">
                      <span className="text-xs font-extrabold text-white">{initials}</span>
                    </div>
                  </button>
                  {userDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl py-2 min-w-[200px]">
                        <div className="px-4 py-2 border-b border-outline-variant/10">
                          <p className="text-sm font-bold text-on-surface">{displayName}</p>
                          <p className="text-xs text-outline">{email}</p>
                        </div>
                        <div className="py-1">
                          <Link
                            to="/profile"
                            onClick={() => setUserDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-primary/5 hover:text-primary transition-colors"
                          >
                            <UserCircle size={16} />
                            Profil Saya
                          </Link>
                        </div>
                        <div className="border-t border-outline-variant/10 pt-1">
                          <button
                            onClick={() => { setUserDropdownOpen(false); handleLogout() }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
                          >
                            <LogOut size={16} />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <section className="flex-1 overflow-y-auto custom-scrollbar bg-background border-r border-outline-variant/15">
              {children}
            </section>
            <footer className="w-full py-4 flex justify-center gap-8 items-center border-t border-outline-variant/15 shrink-0 bg-surface-container-lowest">
              <span className="font-body text-[10px] font-bold tracking-widest text-outline uppercase">
                © {new Date().getFullYear()} BPS Kabupaten Kepulauan Seribu
              </span>
              <div className="flex gap-6">
                <button className="font-body text-[10px] text-outline hover:text-primary font-bold uppercase transition-colors tracking-widest">Support</button>
                <button className="font-body text-[10px] text-outline hover:text-primary font-bold uppercase transition-colors tracking-widest">Kebijakan</button>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </>
  )
}
