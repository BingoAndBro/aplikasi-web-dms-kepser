import * as React from 'react'
import { Link } from '@tanstack/react-router'
import {
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react'

import { NAV_CONFIG } from '#/config/navigation'
import { ROLE_DISPLAY, ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { getWorkspaceLabelFallback } from '#/lib/workspace-label'
import { cn } from '#/lib/utils'

import type { RoleName } from '#/lib/types/auth'

function normalizePath(path: string) {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Whether a nav item's route is exactly the page we're on.
 *
 * Only an exact path match counts — drilling into a detail/sub page
 * (e.g. /ppk/dokumen/$id) is deliberately NOT a match, so the highlight
 * stays on whichever menu the user last opened instead of jumping to a
 * parent route that happens to be a path prefix (like the role Dashboard).
 *
 * The query string is ignored unless the nav item's `to` explicitly carries
 * one, so in-page toggles/filters that only change `?search=` (e.g. the
 * "pegawai" toggle on Nominal Realisasi) keep the menu highlighted.
 */
function matchesNavItem(
  itemTo: string | undefined,
  pathname: string,
  searchStr: string | undefined,
) {
  if (!itemTo) return false

  const [rawItemPath, itemQuery = ''] = itemTo.split('?')
  const itemPath = normalizePath(rawItemPath || '/')
  const currentPath = normalizePath(pathname)
  const currentQuery = searchStr?.replace(/^\?/, '') ?? ''

  if (currentPath !== itemPath) return false
  if (itemQuery) return currentQuery.includes(itemQuery)
  return true
}

// Nav items visible only to a PEGAWAI who leads at least one kegiatan
// (Ketua Tim -- not a role, only an assignment; see AppLayout's
// /users/me/ketua-tim fetch).
const KETUA_TIM_ONLY_NAV_IDS = new Set(['laporan_kegiatan', 'pembersihan_dokumen'])

export function AppSidebar({
  activeRole,
  appSubtitle,
  appTitle,
  pathname,
  searchStr,
  hasKetuaTimAssignment,
  staleNonMaterialCount,
  mobileOpen,
  onMobileOpenChange,
  onLogout,
}: {
  activeRole: RoleName
  /** Admin-configurable (Settings): the name of the latest/active census.
   * Falls back to a role-based workspace label until an admin sets one. */
  appSubtitle?: string
  /** Admin-configurable (Settings): the app's name — the big title. */
  appTitle?: string
  pathname: string
  searchStr?: string
  hasKetuaTimAssignment?: boolean
  /** Badge count for the "Pembersihan Dokumen" nav item (0/undefined hides the badge). */
  staleNonMaterialCount?: number
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onLogout: () => void | Promise<void>
}) {
  const navGroups = React.useMemo(() => {
    const groups = NAV_CONFIG[activeRole] ?? []
    const visibleGroups =
      activeRole !== ROLES.PEGAWAI || hasKetuaTimAssignment
        ? groups
        : groups
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => !KETUA_TIM_ONLY_NAV_IDS.has(item.id)),
            }))
            .filter((group) => group.items.length > 0)

    return visibleGroups
      .map((group) => ({
        ...group,
        items: group.items
          // 'settings' had no route and was hidden outright; now that
          // /admin/settings (Fase 6) exists, only hide it while unbuilt
          // (no `to`) — same "Soon" treatment as any other stub nav item.
          .filter((item) => item.id !== 'settings' || !!item.to)
          .map((item) => item.id === 'pembersihan_dokumen' && staleNonMaterialCount
            ? { ...item, badge: staleNonMaterialCount }
            : item),
      }))
      .filter((group) => group.items.length > 0)
  }, [activeRole, hasKetuaTimAssignment, staleNonMaterialCount])
  const directActiveId = React.useMemo(() => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (matchesNavItem(item.to, pathname, searchStr)) return item.id
      }
    }
    return null
  }, [navGroups, pathname, searchStr])

  // The highlight only moves when the user lands exactly on another menu's
  // route. On any other page — a detail/sub page (e.g. /ppk/dokumen/$id opened
  // from "Dokumen Tervalidasi"), a nested route, a route-swapping toggle — the
  // last matched menu stays lit. Scoped per role and per browser tab.
  const stickyStorageKey = `dms:activeNav:${activeRole}`
  const [stickyActiveId, setStickyActiveId] = React.useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.sessionStorage.getItem(`dms:activeNav:${activeRole}`)
    } catch {
      return null
    }
  })

  React.useEffect(() => {
    if (!directActiveId) return
    setStickyActiveId(directActiveId)
    try {
      window.sessionStorage.setItem(stickyStorageKey, directActiveId)
    } catch {
      /* sessionStorage unavailable — keep the in-memory value only */
    }
  }, [directActiveId, stickyStorageKey])

  const activeItemId = directActiveId ?? stickyActiveId

  const isAdmin = activeRole === ROLES.ADMIN
  const workspaceLabel = appSubtitle || getWorkspaceLabelFallback(isAdmin, ROLE_DISPLAY[activeRole])
  const useCompactDesktopWidth = pathname === '/pegawai/dokumen/aju'

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Tutup navigasi"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[82vw] shrink-0 flex-col gap-5 border-r border-brand-border/80 bg-bg-surface px-4 py-5 shadow-2xl shadow-black/10 transition-transform duration-300 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none',
          useCompactDesktopWidth ? 'lg:w-56 xl:w-60' : 'lg:w-60 xl:w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-2 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm shadow-black/10 ring-1 ring-brand-border">
                <img src="/bps-logo.png" alt="BPS" className="size-6 object-contain" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-headline text-[17px] font-black tracking-tight text-on-surface">
                  {appTitle || 'DMS Kepser'}
                </p>
                <p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-primary">
                  {workspaceLabel}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => onMobileOpenChange(false)}
            className="inline-flex size-8 items-center justify-center rounded-xl border border-brand-border bg-white text-outline shadow-sm transition-all hover:bg-brand-surface hover:text-primary lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          <div className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="px-3 text-[10px] font-black uppercase tracking-[0.2em] text-outline">
                  {group.title}
                </p>
                <nav className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = item.id === activeItemId
                    const isBuilt = !!item.to

                    if (!isBuilt) {
                      return (
                        <div
                          key={item.id}
                          className="flex w-full select-none items-center justify-between rounded-xl px-3 py-2 text-on-surface-variant opacity-45"
                          title="Fitur belum tersedia"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="text-outline">
                              <Icon size={15} />
                            </span>
                            <span className="truncate text-[13px] font-semibold">{item.label}</span>
                          </div>
                          <span className="rounded-full bg-brand-surface px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-outline">
                            Soon
                          </span>
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        onClick={() => onMobileOpenChange(false)}
                        className={cn(
                          'group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-200',
                          isActive
                            ? 'bg-primary text-white shadow-md shadow-brand-solid/15'
                            : 'text-on-surface-variant hover:bg-brand-surface hover:text-brand-text',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              'shrink-0 transition-colors',
                              isActive ? 'text-white' : 'text-outline group-hover:text-primary',
                            )}
                          >
                            <Icon size={15} />
                          </span>
                          <span className={cn('truncate text-[13px] tracking-tight', isActive ? 'font-bold' : 'font-semibold')}>
                            {item.label}
                          </span>
                        </div>
                        {item.badge && (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[9px] font-black',
                              isActive ? 'bg-white/20 text-white' : 'bg-brand-border text-primary',
                            )}
                          >
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
        </div>

        <div className="space-y-1 border-t border-brand-border/80 pt-4">
          <Link
            to={ROUTES.HELP}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-outline transition-all hover:bg-brand-surface hover:text-primary"
          >
            <HelpCircle size={15} />
            Bantuan
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-outline transition-all hover:bg-red-50 hover:text-error"
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
