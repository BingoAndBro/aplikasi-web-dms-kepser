import * as React from 'react'
import {
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
  username,
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
  username?: string
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

  return (
    <header className="z-40 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-brand-border/70 bg-brand-surface/90 px-3 py-2 shadow-sm shadow-black/5 backdrop-blur-xl sm:gap-3 sm:px-4 md:h-20 md:flex-nowrap md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-5">
        <button
          type="button"
          aria-label="Buka navigasi"
          onClick={onOpenMobileSidebar}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border border-brand-border bg-white text-on-surface-variant shadow-sm transition-all hover:border-brand-border-strong hover:bg-brand-surface hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:size-10 lg:hidden"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          <p className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-primary sm:text-[10px] sm:tracking-[0.22em]">
            {eyebrow}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <h1 className="truncate font-headline text-base font-black tracking-tight text-on-surface sm:text-xl md:text-2xl">
              {appTitle || 'DMS Kepser'}
            </h1>
            <RoleBadge role={activeRole} className="hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold md:inline-flex" />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-full border border-brand-border/80 bg-bg-surface py-1 pl-2 pr-1 shadow-sm shadow-black/5 md:gap-4 md:pl-4">
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
          username={username}
          handleLogout={handleLogout}
          initials={initials}
          setUserDropdownOpen={setUserDropdownOpen}
          userDropdownOpen={userDropdownOpen}
        />
      </div>
    </header>
  )
}
