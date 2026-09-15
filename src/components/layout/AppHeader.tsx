import * as React from 'react'
import {
  Bell,
  Menu,
} from 'lucide-react'

import { RoleBadge } from '#/components/ui/RoleBadge'
import { getWorkspaceLabelFallback } from '#/lib/workspace-label'
import { ROLE_DISPLAY } from '#/lib/types/auth'

import type { RoleName } from '#/lib/types/auth'
import { RoleDropdown } from './RoleDropdown'
import { UserDropdown } from './UserDropdown'

export function AppHeader({
  activeRole,
  appSubtitle,
  appTitle,
  avatarUrl,
  canSwitchRole,
  displayName,
  email,
  handleLogout,
  handleRoleSwitch,
  initials,
  isAdmin,
  onOpenMobileSidebar,
  roleSwitcherOpen,
  setRoleSwitcherOpen,
  setUserDropdownOpen,
  userDropdownOpen,
  userRoles,
}: {
  activeRole: RoleName
  /** Admin-configurable (Settings): the small, theme-colored line above the
   * title — the name of the latest/active census. Falls back to a role-based
   * workspace label until an admin sets one. */
  appSubtitle?: string
  /** Admin-configurable (Settings): the app's name — the big title. */
  appTitle?: string
  avatarUrl?: string | null
  canSwitchRole: boolean
  displayName: string
  email?: string
  handleLogout: () => void | Promise<void>
  handleRoleSwitch: (role: RoleName) => void
  initials: string
  isAdmin: boolean
  onOpenMobileSidebar: () => void
  roleSwitcherOpen: boolean
  setRoleSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>
  setUserDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>
  userDropdownOpen: boolean
  userRoles: RoleName[]
}) {
  const roleTitle = isAdmin ? 'Admin Sistem' : ROLE_DISPLAY[activeRole]
  const eyebrow = appSubtitle || getWorkspaceLabelFallback(isAdmin, ROLE_DISPLAY[activeRole])
  const [notificationOpen, setNotificationOpen] = React.useState(false)

  return (
    <header className="z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-brand-border/70 bg-brand-surface/90 px-4 shadow-sm shadow-black/5 backdrop-blur-xl md:h-20 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-5">
        <button
          type="button"
          aria-label="Buka navigasi"
          onClick={onOpenMobileSidebar}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-brand-border bg-white text-on-surface-variant shadow-sm transition-all hover:border-brand-border-strong hover:bg-brand-surface hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 lg:hidden"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-primary">
            {eyebrow}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <h1 className="truncate font-headline text-xl font-black tracking-tight text-on-surface md:text-2xl">
              {appTitle || 'DMS Kepser'}
            </h1>
            <RoleBadge role={activeRole} className="hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold md:inline-flex" />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <div className="relative">
          <button
            type="button"
            aria-label="Buka panel notifikasi visual"
            aria-expanded={notificationOpen}
            aria-haspopup="dialog"
            title="Notifikasi visual saja; belum terhubung ke sumber backend"
            onClick={() => setNotificationOpen((open) => !open)}
            className="relative inline-flex size-10 items-center justify-center rounded-2xl border border-brand-border bg-white text-outline shadow-sm transition-all hover:border-brand-border-strong hover:bg-brand-surface hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <Bell size={19} />
          </button>

          {notificationOpen && (
            <>
              <button
                type="button"
                aria-label="Tutup panel notifikasi"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setNotificationOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Notifikasi"
                className="fixed left-3 right-3 top-20 z-50 overflow-hidden rounded-3xl border border-brand-border bg-white shadow-xl shadow-black/10 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96"
              >
                <div className="bg-brand-surface px-4 py-4">
                  <p className="text-sm font-black text-on-surface">Notifikasi</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-on-surface-variant">
                    Panel visual-only. Belum ada sumber backend notifikasi pada phase ini.
                  </p>
                </div>
                <div className="p-4">
                  <div className="rounded-2xl border border-dashed border-brand-border-strong bg-bg-surface px-4 py-6 text-center">
                    <p className="text-sm font-bold text-on-surface">Belum ada notifikasi aktif</p>
                    <p className="mt-1 text-xs leading-5 text-outline">
                      Tidak ada hitungan unread atau status operasional yang ditampilkan tanpa API resmi.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-full border border-brand-border/80 bg-bg-surface py-1 pl-2 pr-1 shadow-sm shadow-black/5 md:gap-4 md:pl-4">
          {canSwitchRole && (
            <RoleDropdown
              currentRole={activeRole}
              handleRoleSwitch={handleRoleSwitch}
              roleSwitcherOpen={roleSwitcherOpen}
              setRoleSwitcherOpen={setRoleSwitcherOpen}
              userRoles={userRoles}
            />
          )}

          <div className="hidden min-w-0 text-right sm:block">
            <p className="max-w-40 truncate text-xs font-black uppercase tracking-wider text-on-surface">
              {displayName}
            </p>
            <p className="max-w-44 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              {roleTitle}
            </p>
          </div>

          <UserDropdown
            avatarUrl={avatarUrl}
            displayName={displayName}
            email={email}
            handleLogout={handleLogout}
            initials={initials}
            setUserDropdownOpen={setUserDropdownOpen}
            userDropdownOpen={userDropdownOpen}
          />
        </div>
      </div>
    </header>
  )
}
