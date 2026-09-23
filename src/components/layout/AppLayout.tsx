import * as React from 'react'
import { useRouterState } from '@tanstack/react-router'

import { ROLE_DEFAULT_ROUTE } from '#/config/navigation'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { clearClientAuthState, setClientAuthState, updateClientAuthState } from '#/lib/auth-state'
import { logDev } from '#/lib/dev-logger'
import { MESH_ROUTES, ROUTES } from '#/lib/constants/routes'
import { ROLES } from '#/lib/constants/roles'
import { AppToastProvider } from '#/components/ui/AppToast'

import type { RoleName } from '#/lib/types/auth'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'
import { SettingsChangedOverlay } from './SettingsChangedOverlay'

const SETTINGS_EPOCH_POLL_MS = 20_000

const ACTIVE_ROLE_COOKIE = 'dms_active_role'
const APP_THEME_STORAGE_KEY = 'app-theme'
const APP_THEME_COOKIE = 'app-theme'
const VALID_THEMES = ['se', 'sp', 'st'] as const
type AppTheme = (typeof VALID_THEMES)[number]

function applyTheme(theme: AppTheme) {
  if (theme === 'se') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = theme
  }
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  } catch { /* private mode / storage disabled */ }
  document.cookie = `${APP_THEME_COOKIE}=${theme}; path=/; max-age=31536000`
}

function clearAppState() {
  document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0`
  clearClientAuthState('unauthenticated', true)
}

function getInitials(name?: string, username?: string): string {
  if (name) {
    const parts = name.split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }
  if (username) return username.substring(0, 2).toUpperCase()
  return '??'
}

type ChairmanStatusResponse = {
  kegiatan?: { id: string; nama: string }[]
  stale_non_material_count?: number
}

type AuthSessionResponse = {
  session: {
    userId: string
    username: string
    displayName?: string
  } | null
  roles: RoleName[]
  activeRole: RoleName | null
}

type CurrentUserProfileResponse = {
  user: {
    username: string
    metadata: {
      nama_lengkap?: string
    }
    avatar_url?: string | null
    avatar_updated_at?: string | null
  }
}

type RoleSwitchResponse = {
  success: true
  activeRole: RoleName
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState()
  const lastAuthLogRef = React.useRef<string>('')

  const [userRoles, setUserRoles] = React.useState<RoleName[]>([])
  const [activeRole, setActiveRole] = React.useState<RoleName>(ROLES.PEGAWAI)
  const [userName, setUserName] = React.useState<string | undefined>()
  const [username, setUsername] = React.useState<string | undefined>()
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [chairmanKegiatan, setChairmanKegiatan] = React.useState<{ id: string; nama: string }[]>([])
  const [staleNonMaterialCount, setStaleNonMaterialCount] = React.useState(0)

  const [appTitle, setAppTitle] = React.useState<string>('DMS Kepser')
  const [appSubtitle, setAppSubtitle] = React.useState<string>('')

  const [settingsChanged, setSettingsChanged] = React.useState(false)
  const [forcingLogout, setForcingLogout] = React.useState(false)
  const settingsEpochBaselineRef = React.useRef<number | null>(null)

  const [hasSession, setHasSession] = React.useState(false)
  const [roleSwitcherOpen, setRoleSwitcherOpen] = React.useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)

  const pathname = routerState.location.pathname
  const isMeshPage = MESH_ROUTES.some((route) => route === pathname)
  const isLoginPage = pathname === ROUTES.LOGIN

  const refreshCurrentUserProfile = React.useCallback(async () => {
    try {
      const profileData = await apiFetch<CurrentUserProfileResponse>('/users/me/')
      setUserName(profileData.user.metadata.nama_lengkap)
      setUsername(profileData.user.username)
      setAvatarUrl(profileData.user.avatar_url ?? null)
    } catch (err) {
      setAvatarUrl(null)
      if (!(err instanceof Error && err.name === 'ApiError')) {
        console.error('Failed to fetch current user profile:', err)
      }
    }
  }, [])

  const fetchSession = React.useCallback(async () => {
    let data: AuthSessionResponse
    try {
      data = await apiFetch<AuthSessionResponse>('/auth/session')
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ApiError')) {
        console.error('Failed to fetch auth session:', err)
      }
      clearClientAuthState('unauthenticated', true)
      setUserRoles([])
      setActiveRole(ROLES.PEGAWAI)
      setUserName(undefined)
      setUsername(undefined)
      setAvatarUrl(null)
      setHasSession(false)
      setChairmanKegiatan([])
      setIsLoading(false)
      return
    }

    if (!data.session || data.roles.length === 0 || !data.activeRole) {
      clearClientAuthState('unauthenticated', true)
      setUserRoles([])
      setActiveRole(ROLES.PEGAWAI)
      setUserName(undefined)
      setUsername(undefined)
      setAvatarUrl(null)
      setHasSession(false)
      setChairmanKegiatan([])
      setIsLoading(false)
      return
    }

    setHasSession(true)
    setUserName(data.session.displayName)
    setUsername(data.session.username)
    setAvatarUrl(null)
    setChairmanKegiatan([])
    setStaleNonMaterialCount(0)

    await refreshCurrentUserProfile()

    try {
      const ktData = await apiFetch<ChairmanStatusResponse>('/users/me/ketua-tim')
      setChairmanKegiatan(ktData.kegiatan || [])
      setStaleNonMaterialCount(ktData.stale_non_material_count ?? 0)
    } catch (err) {
      setChairmanKegiatan([])
      setStaleNonMaterialCount(0)
      if (!(err instanceof Error && err.name === 'ApiError')) {
        console.error('Failed to fetch chairman status:', err)
      }
    }

    setUserRoles(data.roles)
    setActiveRole(data.activeRole)
    const nextAuthState = {
      status: 'authenticated',
      userId: data.session.userId,
      username: data.session.username,
      roles: data.roles,
      activeRole: data.activeRole,
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
  }, [refreshCurrentUserProfile])

  React.useEffect(() => {
    fetchSession()
  }, [fetchSession])

  React.useEffect(() => {
    if (!hasSession) return
    let cancelled = false
    apiFetch<{ theme: AppTheme }>('/settings/theme')
      .then((data) => {
        if (cancelled) return
        if (VALID_THEMES.includes(data.theme)) applyTheme(data.theme)
      })
      .catch((err) => {
        if (!(err instanceof ApiError)) {
          console.error('Failed to fetch theme setting:', err)
        }
      })
    return () => { cancelled = true }
  }, [hasSession])

  React.useEffect(() => {
    if (!hasSession) return
    let cancelled = false
    apiFetch<{ appTitle: string; appSubtitle: string }>('/settings/general')
      .then((data) => {
        if (cancelled) return
        setAppTitle(data.appTitle)
        setAppSubtitle(data.appSubtitle)
      })
      .catch((err) => {
        if (!(err instanceof ApiError)) {
          console.error('Failed to fetch general settings:', err)
        }
      })
    return () => { cancelled = true }
  }, [hasSession])

  React.useEffect(() => {
    if (!hasSession) return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    const checkEpoch = async () => {
      try {
        const data = await apiFetch<{ epoch: number }>('/settings/epoch')
        if (cancelled) return
        if (settingsEpochBaselineRef.current === null) {
          settingsEpochBaselineRef.current = data.epoch
          return
        }
        if (data.epoch > settingsEpochBaselineRef.current) {
          setSettingsChanged(true)
          if (intervalId) clearInterval(intervalId)
        }
      } catch (err) {
        if (!(err instanceof ApiError)) {
          console.error('Failed to poll settings epoch:', err)
        }
      }
    }

    checkEpoch()
    intervalId = setInterval(checkEpoch, SETTINGS_EPOCH_POLL_MS)
    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [hasSession])

  const handleForcedLogout = React.useCallback(async () => {
    setForcingLogout(true)
    try {
      // Pick up the theme the admin just switched to *before* logging out —
      // the session is still valid here, and the login page (THEME_INIT_SCRIPT)
      // only ever reads localStorage, so without this it would render the
      // previous theme until the user reaches a page past login.
      const themeData = await apiFetch<{ theme: AppTheme }>('/settings/theme')
      if (VALID_THEMES.includes(themeData.theme)) applyTheme(themeData.theme)
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Failed to refresh theme before forced logout:', err)
      }
    }
    try {
      await apiMutation('/auth/logout')
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Failed to logout after settings change:', err)
      }
    } finally {
      clearAppState()
      window.location.href = ROUTES.LOGIN
    }
  }, [])

  React.useEffect(() => {
    const handleProfileAvatarChanged = () => {
      void refreshCurrentUserProfile()
    }

    window.addEventListener('dms:profile-avatar-changed', handleProfileAvatarChanged)
    return () => window.removeEventListener('dms:profile-avatar-changed', handleProfileAvatarChanged)
  }, [refreshCurrentUserProfile])

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

  const handleRoleSwitch = async (newRole: RoleName) => {
    try {
      const data = await apiMutation<RoleSwitchResponse>('/auth/role-switch', {
        body: { activeRole: newRole },
      })
      setActiveRole(data.activeRole)
      updateClientAuthState({ activeRole: data.activeRole })
      window.location.href = ROLE_DEFAULT_ROUTE[data.activeRole]
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Failed to switch role:', err)
      }
    }
  }

  const handleLogout = async () => {
    setIsLoading(true)
    let logoutSucceeded = false
    try {
      await apiMutation('/auth/logout')
      logoutSucceeded = true
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Failed to logout:', err)
      }
    } finally {
      setIsLoading(false)
    }

    if (!logoutSucceeded) {
      return
    }

    setUserRoles([]); setActiveRole(ROLES.PEGAWAI)
    setUserName(undefined); setUsername(undefined); setAvatarUrl(null)
    setHasSession(false); clearAppState()
    window.location.href = ROUTES.LOGIN
  }

  const isAdmin = activeRole === ROLES.ADMIN
  const initials = getInitials(userName, username)
  const displayName = userName || username || 'User'
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
      {settingsChanged && (
        <SettingsChangedOverlay onConfirm={handleForcedLogout} loading={forcingLogout} />
      )}

      {isMeshPage && (
        <div className="mesh-bg">
          <div className="mesh-blob mesh-blob-1" />
          <div className="mesh-blob mesh-blob-2" />
          <div className="mesh-blob mesh-blob-3" />
        </div>
      )}

      <AppToastProvider>
        <div className="relative flex h-screen overflow-hidden bg-brand-surface selection:bg-primary-container selection:text-on-primary-container">
        <AppSidebar
          activeRole={activeRole}
          appSubtitle={appSubtitle}
          appTitle={appTitle}
          hasKetuaTimAssignment={chairmanKegiatan.length > 0}
          staleNonMaterialCount={staleNonMaterialCount}
          mobileOpen={mobileSidebarOpen}
          onMobileOpenChange={setMobileSidebarOpen}
          pathname={routerState.location.pathname}
          searchStr={routerState.location.searchStr}
          onLogout={handleLogout}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader
            activeRole={activeRole}
            appSubtitle={appSubtitle}
            appTitle={appTitle}
            avatarUrl={avatarUrl}
            canSwitchRole={canSwitchRole}
            displayName={displayName}
            username={username}
            handleLogout={handleLogout}
            handleRoleSwitch={handleRoleSwitch}
            initials={initials}
            isAdmin={isAdmin}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            roleSwitcherOpen={roleSwitcherOpen}
            setRoleSwitcherOpen={setRoleSwitcherOpen}
            setUserDropdownOpen={setUserDropdownOpen}
            userDropdownOpen={userDropdownOpen}
            userRoles={userRoles}
          />

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-brand-surface">
            <section
              className="flex-1 overflow-y-auto custom-scrollbar border-r border-brand-border/60"
              style={{
                background: 'radial-gradient(circle at top right, color-mix(in srgb, var(--brand-solid) 45%, transparent), transparent 32rem), linear-gradient(180deg, var(--brand-surface) 0%, var(--bg-sunken) 100%)',
              }}
            >
              {children}
            </section>
            <footer className="w-full py-3 flex flex-wrap justify-center gap-x-8 gap-y-2 items-center border-t border-brand-border/70 shrink-0 bg-bg-surface/90">
              <span className="font-body text-[10px] font-bold tracking-widest text-outline uppercase">
                &copy; {new Date().getFullYear()} BPS Kabupaten Kepulauan Seribu
              </span>
              <div className="flex gap-6">
                <button className="font-body text-[10px] text-outline hover:text-primary font-bold uppercase transition-colors tracking-widest">Bantuan</button>
                <button className="font-body text-[10px] text-outline hover:text-primary font-bold uppercase transition-colors tracking-widest">Kebijakan</button>
              </div>
            </footer>
          </main>
        </div>
        </div>
      </AppToastProvider>
    </>
  )
}
