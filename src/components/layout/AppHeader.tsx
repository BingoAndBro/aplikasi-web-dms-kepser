import {
  Bell,
  Menu,
} from 'lucide-react'

import { RoleBadge } from '#/components/ui/RoleBadge'
import { ROLE_DISPLAY } from '#/lib/types/auth'

import type { RoleName } from '#/lib/types/auth'
import { RoleDropdown } from './RoleDropdown'
import { UserDropdown } from './UserDropdown'

export function AppHeader({
  activeRole,
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

  return (
    <header className="z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-orange-100/70 bg-[#FFF8F1]/90 px-4 shadow-sm shadow-orange-950/5 backdrop-blur-xl md:h-20 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-5">
        <button
          type="button"
          aria-label="Buka navigasi"
          onClick={onOpenMobileSidebar}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-white text-on-surface-variant shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 lg:hidden"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
            DMS Workspace
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <h1 className="truncate font-headline text-xl font-black tracking-tight text-on-surface md:text-2xl">
              {roleTitle}
            </h1>
            <RoleBadge role={activeRole} className="hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold md:inline-flex" />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <button
          type="button"
          aria-label="Notifikasi visual saja"
          title="Notifikasi visual saja; belum terhubung ke sumber backend"
          className="relative inline-flex size-10 items-center justify-center rounded-2xl border border-orange-100 bg-white text-outline shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <Bell size={19} />
        </button>

        <div className="flex items-center gap-3 rounded-full border border-orange-100/80 bg-[#FFFDF9] py-1 pl-2 pr-1 shadow-sm shadow-orange-950/5 md:gap-4 md:pl-4">
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
            activeRole={activeRole}
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
