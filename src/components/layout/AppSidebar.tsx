import * as React from 'react'
import { Link } from '@tanstack/react-router'
import {
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react'

import { NAV_CONFIG } from '#/config/navigation'
import { ROLE_DISPLAY, ROLES } from '#/lib/constants/roles'
import { cn } from '#/lib/utils'

import type { RoleName } from '#/lib/types/auth'

function isNavItemActive(itemTo: string | undefined, pathname: string, searchStr: string | undefined) {
  const itemPath = itemTo?.split('?')[0] ?? ''
  const itemQuery = itemTo?.split('?')[1] ?? ''
  const currentQuery = searchStr?.replace(/^\?/, '') ?? ''

  if (!itemTo) return false
  if (itemTo === '/') return pathname === '/'
  if (itemQuery) return pathname === itemPath && currentQuery.includes(itemQuery)
  return pathname === itemPath && currentQuery === ''
}

export function AppSidebar({
  activeRole,
  pathname,
  searchStr,
  hasKetuaTimAssignment,
  mobileOpen,
  onMobileOpenChange,
  onLogout,
}: {
  activeRole: RoleName
  pathname: string
  searchStr?: string
  hasKetuaTimAssignment?: boolean
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
              items: group.items.filter((item) => item.id !== 'laporan_kegiatan'),
            }))
            .filter((group) => group.items.length > 0)

    return visibleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.id !== 'settings'),
      }))
      .filter((group) => group.items.length > 0)
  }, [activeRole, hasKetuaTimAssignment])
  const isAdmin = activeRole === ROLES.ADMIN
  const workspaceLabel = isAdmin ? 'Manajemen Sistem' : `${ROLE_DISPLAY[activeRole]} Workspace`
  const useCompactDesktopWidth = pathname === '/pegawai/dokumen/aju'

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Tutup navigasi"
          className="fixed inset-0 z-40 bg-orange-950/30 backdrop-blur-sm lg:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-80 max-w-[86vw] shrink-0 flex-col gap-7 border-r border-orange-100/80 bg-[#FFFDF9] px-5 py-6 shadow-2xl shadow-orange-950/10 transition-transform duration-300 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none',
          useCompactDesktopWidth ? 'lg:w-64 xl:w-72' : 'lg:w-72 xl:w-80',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-md shadow-orange-950/10 ring-1 ring-orange-100">
                <img src="/bps-logo.png" alt="BPS" className="size-8 object-contain" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-headline text-xl font-black tracking-tight text-on-surface">
                  {isAdmin ? 'Admin Sistem' : 'DMS Kepser'}
                </p>
                <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                  {workspaceLabel}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => onMobileOpenChange(false)}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-orange-100 bg-white text-outline shadow-sm transition-all hover:bg-orange-50 hover:text-primary lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          <div className="space-y-7">
            {navGroups.map((group) => (
              <div key={group.title} className="space-y-2.5">
                <p className="px-3 text-[10px] font-black uppercase tracking-[0.25em] text-outline">
                  {group.title}
                </p>
                <nav className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = isNavItemActive(item.to, pathname, searchStr)
                    const isBuilt = !!item.to

                    if (!isBuilt) {
                      return (
                        <div
                          key={item.id}
                          className="flex w-full select-none items-center justify-between rounded-2xl px-3.5 py-3 text-on-surface-variant opacity-45"
                          title="Fitur belum tersedia"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="text-outline">
                              <Icon size={18} />
                            </span>
                            <span className="truncate text-sm font-semibold">{item.label}</span>
                          </div>
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-outline">
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
                          'group flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left transition-all duration-200',
                          isActive
                            ? 'bg-primary text-white shadow-lg shadow-orange-600/20'
                            : 'text-on-surface-variant hover:bg-orange-50 hover:text-orange-950',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'shrink-0 transition-colors',
                              isActive ? 'text-white' : 'text-outline group-hover:text-primary',
                            )}
                          >
                            <Icon size={18} />
                          </span>
                          <span className={cn('truncate text-sm tracking-tight', isActive ? 'font-bold' : 'font-semibold')}>
                            {item.label}
                          </span>
                        </div>
                        {item.badge && (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-black',
                              isActive ? 'bg-white/20 text-white' : 'bg-orange-100 text-primary',
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

        <div className="space-y-1 border-t border-orange-100/80 pt-5">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-bold text-outline transition-all hover:bg-orange-50 hover:text-primary"
          >
            <HelpCircle size={17} />
            Bantuan
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-bold text-outline transition-all hover:bg-red-50 hover:text-error"
          >
            <LogOut size={17} />
            Keluar
          </button>
        </div>
      </aside>
    </>
  )
}
