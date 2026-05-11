import * as React from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'

import { ROLE_DEFAULT_ROUTE } from '#/config/navigation'
import { apiFetch } from '#/lib/api-client'
import { getBrowserClient } from '#/lib/supabase-browser'
import { ACTIVE_ROLE_COOKIE, getPrimaryRole } from '#/lib/auth'
import { clearClientAuthState, setClientAuthState, updateClientAuthState } from '#/lib/auth-state'
import { logDev } from '#/lib/dev-logger'
import { MESH_ROUTES, ROUTES } from '#/lib/constants/routes'
import { ROLES } from '#/lib/constants/roles'

import type { RoleName } from '#/lib/types/auth'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'

function clearAppState() {
  document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0`
  clearClientAuthState('unauthenticated', true)
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

type ChairmanStatusResponse = {
  kegiatan?: { id: string; nama: string }[]
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const lastAuthLogRef = React.useRef<string>('')

  const [userRoles, setUserRoles] = React.useState<RoleName[]>([])
  const [activeRole, setActiveRole] = React.useState<RoleName>(ROLES.PEGAWAI)
  const [userName, setUserName] = React.useState<string | undefined>()
  const [email, setEmail] = React.useState<string | undefined>()
  const [isLoading, setIsLoading] = React.useState(true)
  const [chairmanKegiatan, setChairmanKegiatan] = React.useState<{ id: string; nama: string }[]>([])

  const fetchChairmanStatus = React.useCallback(async (session: any) => {
    if (!session) return
    try {
      const data = await apiFetch<ChairmanStatusResponse>('/users/me/ketua-tim')
      setChairmanKegiatan(data.kegiatan || [])
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ApiError')) {
        console.error('Failed to fetch chairman status:', err)
      }
    }
  }, [])
  const [hasSession, setHasSession] = React.useState(false)
  const [roleSwitcherOpen, setRoleSwitcherOpen] = React.useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false)

  const supabase = React.useMemo(() => getBrowserClient(), [])

  const pathname = routerState.location.pathname
  const isMeshPage = MESH_ROUTES.some((route) => route === pathname)
  const isLoginPage = pathname === ROUTES.LOGIN

  const fetchSession = React.useCallback(async () => {
    if (!supabase) {
      clearClientAuthState('unauthenticated', true)
      setIsLoading(false)
      setHasSession(false)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      clearClientAuthState('unauthenticated', true)
      setIsLoading(false)
      setHasSession(false)
      return
    }

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
      const ktData = await apiFetch<ChairmanStatusResponse>('/users/me/ketua-tim')
      setChairmanKegiatan(ktData.kegiatan || [])
      isChairman = (ktData.kegiatan || []).length > 0
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ApiError')) {
        console.error('Failed to fetch chairman status:', err)
      }
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
    const nextAuthState = {
      status: 'authenticated',
      userId: session.user.id,
      email: session.user.email ?? undefined,
      roles: roleNames,
      activeRole: effectiveRole,
      isReady: true,
    } as const
    setClientAuthState(nextAuthState)
    const authLogKey = `${nextAuthState.userId ?? 'none'}:${nextAuthState.activeRole ?? 'none'}:${nextAuthState.isReady ? '1' : '0'}`
    if (authLogKey !== lastAuthLogRef.current) {
      lastAuthLogRef.current = authLogKey
      logDev('[AUTH] setAuthState', {
        userId: nextAuthState.userId,
        roles: nextAuthState.roles,
        activeRole: nextAuthState.activeRole,
        isReady: nextAuthState.isReady,
      }, `auth:${nextAuthState.userId}:${nextAuthState.activeRole}:${nextAuthState.isReady ? '1' : '0'}`)
    }
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
        if (newRole && userRoles.includes(newRole)) {
          setActiveRole(newRole)
          updateClientAuthState({ activeRole: newRole })
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [userRoles, chairmanKegiatan])

  const handleRoleSwitch = (newRole: RoleName) => {
    document.cookie = `${ACTIVE_ROLE_COOKIE}=${newRole}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    updateClientAuthState({ activeRole: newRole })
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
          <AppHeader
            activeRole={activeRole}
            canSwitchRole={canSwitchRole}
            displayName={displayName}
            email={email}
            handleLogout={handleLogout}
            handleRoleSwitch={handleRoleSwitch}
            initials={initials}
            isAdmin={isAdmin}
            roleSwitcherOpen={roleSwitcherOpen}
            setRoleSwitcherOpen={setRoleSwitcherOpen}
            setUserDropdownOpen={setUserDropdownOpen}
            userDropdownOpen={userDropdownOpen}
            userRoles={userRoles}
          />

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
