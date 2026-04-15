import * as React from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  FilePlus,
  BadgeCheck,
  ClipboardCheck,
  FileEdit,
  Banknote,
  CheckSquare,
  Archive,
  FolderOpen,
  Network,
  History,
  Settings,
  HelpCircle,
  LogOut,
  Shield,
  Building2,
  FileCheck,
  Cloud,
  Search,
  Bell,
  ChevronDown,
  FileX,
  Trash2,
} from 'lucide-react'

import { getBrowserClient } from '#/lib/supabase-browser'
import { ACTIVE_ROLE_COOKIE, getPrimaryRole } from '#/lib/auth'
import type { RoleName } from '#/lib/types/auth'
import { ROLE_DISPLAY } from '#/lib/types/auth'

// ─── Role → Default Route Mapping ─────────────────────────────────────────────
// Maps each role to its default dashboard path. Used after role switch so the
// user lands on the correct page for their new role instead of staying on the
// previous role's page.
const ROLE_DEFAULT_ROUTE: Record<RoleName, string> = {
  PEGAWAI: '/',
  PPK: '/ppk',
  BENDAHARA: '/bendahara',
  ARSIPARIS: '/arsiparis',
  ADMIN: '/admin',
}

// ─── Nav Config ─────────────────────────────────────────────────────────────

type NavItem = {
  id: string
  label: string
  icon: React.ElementType
  to?: string
  badge?: number
}

type MenuGroup = {
  title: string
  items: NavItem[]
}

const NAV_CONFIG: Record<RoleName, MenuGroup[]> = {
  PEGAWAI: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/' }],
    },
    {
      title: 'MANAGEMENT',
      items: [
        { id: 'aju', label: 'Ajukan Dokumen', icon: FilePlus, to: '/dokumen/aju' },
        { id: 'diajukan', label: 'Dokumen Diajukan', icon: ClipboardList, to: '/dokumen/saya' },
        { id: 'revisi', label: 'Revisi Dokumen', icon: FileEdit, to: '/dokumen/saya?status=NEED_REVISION' },
        { id: 'selesai', label: 'Dokumen Selesai', icon: FileText, to: '/dokumen/saya?status=COMPLETED' },
      ],
    },
    {
      title: 'ARSIP',
      items: [
        { id: 'arsip', label: 'Cari Arsip', icon: Archive, to: '/arsip' },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  PPK: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/ppk' }],
    },
    {
      title: 'VALIDASI',
      items: [
        { id: 'validasi', label: 'Validasi Dokumen', icon: BadgeCheck, to: '/ppk/inbox' },
        { id: 'tervalidasi', label: 'Dokumen Tervalidasi', icon: ClipboardCheck, to: '/ppk/tervalidasi' },
        { id: 'ditolak', label: 'Dokumen Tidak Valid', icon: FileX, to: '/ppk/ditolak' },
        { id: 'revisi', label: 'Revisi Dokumen', icon: FileEdit, to: '/ppk/revisi' },
      ],
    },
    {
      title: 'ARSIP',
      items: [
        { id: 'arsip', label: 'Cari Arsip', icon: Archive, to: '/arsip' },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  BENDAHARA: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/bendahara' }],
    },
    {
      title: 'PERSETUJUAN',
      items: [
        { id: 'persetujuan', label: 'Persetujuan Dokumen', icon: Banknote, to: '/bendahara/inbox' },
        { id: 'ditolak', label: 'Dokumen Ditolak', icon: FileX, to: '/bendahara/ditolak' },
        { id: 'selesai', label: 'Dokumen Selesai', icon: CheckSquare, to: '/bendahara/selesai' },
      ],
    },
    {
      title: 'ARSIP',
      items: [
        { id: 'arsip', label: 'Cari Arsip', icon: Archive, to: '/arsip' },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  ARSIPARIS: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/arsiparis' }],
    },
    {
      title: 'PEMBERKASAN',
      items: [
        { id: 'pemberkasan', label: 'Pemberkasan Arsip', icon: Archive, to: '/arsiparis/inbox' },
        { id: 'arsip_aktif', label: 'Daftar Arsip Aktif', icon: FolderOpen, to: '/arsiparis/aktif' },
        { id: 'arsip_inaktif', label: 'Daftar Arsip Inaktif', icon: Archive, to: '/arsiparis/inaktif' },
        { id: 'usul_musnah', label: 'Usul Musnah', icon: Trash2, to: '/arsiparis/usul-musnah' },
        { id: 'klasifikasi', label: 'Master Klasifikasi', icon: Network, to: '/arsiparis/klasifikasi' },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  ADMIN: [
    {
      title: 'GENERAL',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/admin' }],
    },
    {
      title: 'MANAGEMENT',
      items: [
        { id: 'master_user', label: 'Master User', icon: Shield, to: '/admin/master-data/user' },
        { id: 'master_fungsi', label: 'Departemen Fungsi', icon: Building2, to: '/admin/master-data/fungsi' },
        { id: 'master_kegiatan', label: 'Master Kegiatan', icon: ClipboardList, to: '/admin/master-data/kegiatan' },
        { id: 'master_kelengkapan', label: 'Kelengkapan Dokumen', icon: FileCheck, to: '/admin/master-data/kelengkapan' },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'history', label: 'Activity Log', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── AppLayout ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const routerState = useRouterState()

  const [userRoles, setUserRoles] = React.useState<RoleName[]>([])
  const [activeRole, setActiveRole] = React.useState<RoleName>('PEGAWAI')
  const [userName, setUserName] = React.useState<string | undefined>()
  const [email, setEmail] = React.useState<string | undefined>()
  const [isLoading, setIsLoading] = React.useState(true)
  const [hasSession, setHasSession] = React.useState(false)
  const [roleSwitcherOpen, setRoleSwitcherOpen] = React.useState(false)

  const supabase = React.useMemo(() => getBrowserClient(), [])

  const fetchSession = React.useCallback(async () => {
    if (!supabase) { setIsLoading(false); setHasSession(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setIsLoading(false); setHasSession(false); return }

    setHasSession(true)
    setUserName(session.user.user_metadata?.user_name as string | undefined)
    setEmail(session.user.email ?? undefined)

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role:roles(nama)')
      .eq('user_id', session.user.id)

    const roleNames = (rolesData ?? [])
      .map((r: { role?: { nama?: RoleName } }) => r.role?.nama)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        setUserRoles([]); setActiveRole('PEGAWAI')
        setUserName(undefined); setEmail(undefined)
        setHasSession(false); clearAppState()
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchSession()
      }
    })
    return () => { subscription.unsubscribe() }
  }, [fetchSession])

  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ACTIVE_ROLE_COOKIE) {
        const newRole = e.newValue as RoleName | null
        if (newRole && userRoles.includes(newRole)) setActiveRole(newRole)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [userRoles])

  const handleRoleSwitch = (newRole: RoleName) => {
    document.cookie = `${ACTIVE_ROLE_COOKIE}=${newRole}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    // Redirect immediately — page reload resets all local state anyway,
    // so no need to call setActiveRole / setRoleSwitcherOpen here.
    // Calling them would trigger React's "setState during render" warning.
    window.location.href = ROLE_DEFAULT_ROUTE[newRole]
  }

  const handleLogout = async () => {
    setIsLoading(true)
    setUserRoles([]); setActiveRole('PEGAWAI')
    setUserName(undefined); setEmail(undefined)
    setHasSession(false); clearAppState()
    const supabase = getBrowserClient()
    if (supabase) await supabase.auth.signOut()
    navigate({ to: '/login' })
  }

  const isLoginPage = routerState.location.pathname === '/login'
  if (isLoginPage) return <>{children}</>

  // TC 13: segera redirect ke /login jika belum login (tidak render layout tanpa session)
  if (!isLoading && !hasSession) {
    navigate({ to: '/login' })
    return (
      <>
        <div className="mesh-bg">
          <div className="mesh-blob mesh-blob-1" />
          <div className="mesh-blob mesh-blob-2" />
          <div className="mesh-blob mesh-blob-3" />
        </div>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 mx-auto animate-pulse" />
            <p className="text-[11px] font-extrabold text-outline uppercase tracking-widest">Memuat...</p>
          </div>
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <>
        <div className="mesh-bg">
          <div className="mesh-blob mesh-blob-1" />
          <div className="mesh-blob mesh-blob-2" />
          <div className="mesh-blob mesh-blob-3" />
        </div>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 mx-auto animate-pulse" />
            <p className="text-[11px] font-extrabold text-outline uppercase tracking-widest">Memuat...</p>
          </div>
        </div>
      </>
    )
  }

  const isAdmin = activeRole === 'ADMIN'
  const menuGroups = NAV_CONFIG[activeRole] ?? NAV_CONFIG.PEGAWAI
  const pathname = routerState.location.pathname
  const initials = getInitials(userName, email)
  const displayName = userName || email?.split('@')[0] || 'User'
  const canSwitchRole = userRoles.length > 1 && !isAdmin

  return (
    <>
      {/* Animated Mesh Background */}
      <div className="mesh-bg">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
      </div>

      <div className="flex h-screen overflow-hidden bg-background relative selection:bg-primary-container selection:text-on-primary-container">
        {/* ── Sidebar ── */}
        <aside className="w-72 h-full bg-surface-container-lowest/40 backdrop-blur-2xl flex flex-col py-8 px-6 gap-8 border-r border-white/5 shrink-0 z-50">
          {/* Logo + Title */}
          <div className="px-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white shadow-lg shadow-primary/10">
                <img src="/bps-logo.png" alt="BPS" className="w-7 h-7 object-contain" />
              </div>
              <h2 className="font-headline font-extrabold text-xl tracking-tight text-on-surface">
                {isAdmin ? 'Curator Admin' : 'DMS Architect'}
              </h2>
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-primary ml-11">
              {isAdmin ? 'System Management' : `${activeRole} Workspace`}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2 space-y-8">
            {menuGroups.map((group) => (
              <div key={group.title} className="space-y-3">
                <h3 className="text-[10px] font-black text-outline uppercase tracking-[0.25em] px-4">
                  {group.title}
                </h3>
                <nav className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = item.to ? pathname === item.to : false
                    const isBuilt = !!item.to

                    if (!isBuilt) {
                      return (
                        <div
                          key={item.id}
                          className="w-full flex items-center justify-between p-3.5 rounded-xl opacity-40 cursor-not-allowed select-none"
                          title="Fitur belum tersedia"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-outline">
                              <Icon size={18} />
                            </span>
                            <span className="text-sm font-medium text-on-surface-variant">{item.label}</span>
                          </div>
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-surface-container text-outline font-black uppercase tracking-widest">
                            Soon
                          </span>
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.id}
                        to={item.to!}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-all duration-300 group ${
                          isActive
                            ? 'bg-primary text-white shadow-xl shadow-primary/30'
                            : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`${isActive ? 'text-white' : 'text-outline group-hover:text-primary'} transition-colors`}>
                            <Icon size={18} />
                          </span>
                          <span className={`text-sm tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                            {item.label}
                          </span>
                        </div>
                        {item.badge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black ${
                            isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* Bottom actions */}
          <div className="flex flex-col gap-1 border-t border-outline-variant/10 pt-6">
            <button className="flex items-center gap-3 text-outline text-[11px] font-bold p-3 hover:text-primary transition-all group">
              <HelpCircle size={16} className="group-hover:rotate-12 transition-transform" />
              Support Center
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 text-outline text-[11px] font-bold p-3 hover:text-error transition-all group"
            >
              <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-20 flex justify-between items-center px-10 bg-background/60 backdrop-blur-xl border-b border-outline-variant/10 z-40">
            <div className="flex items-center gap-12 flex-1">
              {/* Left title */}
              <div className="flex items-center gap-4">
                {isAdmin ? (
                  <span className="text-xl font-extrabold tracking-tight text-primary shrink-0">Admin Curator</span>
                ) : (
                  <h2 className="text-2xl font-black tracking-tighter text-on-surface font-headline shrink-0">
                    {ROLE_DISPLAY[activeRole]}
                  </h2>
                )}
              </div>

              {/* Search */}
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
              {/* Icon actions */}
              <div className="flex items-center gap-5">
                <button className="text-outline hover:text-primary hover:bg-primary/5 p-2.5 rounded-xl transition-all relative">
                  <Bell size={22} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background" />
                </button>
                <button className="text-outline hover:text-primary hover:bg-primary/5 p-2.5 rounded-xl transition-all">
                  <Settings size={22} />
                </button>
              </div>

              {/* User area */}
              <div className="flex items-center gap-4 pl-8 border-l border-outline-variant/10">
                {/* Role switcher (non-admin, multi-role only) */}
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

                {/* User info */}
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-on-surface uppercase tracking-wider">{displayName}</p>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                    {isAdmin ? 'Super Administrator' : ROLE_DISPLAY[activeRole]}
                  </p>
                </div>

                {/* Avatar */}
                <div className="w-11 h-11 rounded-2xl bg-primary/10 p-0.5 shadow-xl">
                  <div className="w-full h-full rounded-[14px] bg-primary flex items-center justify-center border-2 border-background">
                    <span className="text-xs font-extrabold text-white">{initials}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 flex overflow-hidden">
            <section className="flex-1 flex flex-col min-w-0 bg-background border-r border-outline-variant/15">
              {children}

              <footer className="w-full py-4 flex justify-center gap-8 items-center mt-auto border-t border-outline-variant/15 shrink-0 bg-surface-container-lowest">
                <span className="font-body text-[10px] font-bold tracking-widest text-outline uppercase">
                  © {new Date().getFullYear()} BPS Kabupaten Kepulauan Seribu
                </span>
                <div className="flex gap-6">
                  <button className="font-body text-[10px] text-outline hover:text-primary font-bold uppercase transition-colors tracking-widest">Support</button>
                  <button className="font-body text-[10px] text-outline hover:text-primary font-bold uppercase transition-colors tracking-widest">Kebijakan</button>
                </div>
              </footer>
            </section>
          </main>
        </div>
      </div>
    </>
  )
}
