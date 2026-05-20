import {
  Bell,
  Search,
  Settings,
} from 'lucide-react'

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
  roleSwitcherOpen: boolean
  setRoleSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>
  setUserDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>
  userDropdownOpen: boolean
  userRoles: RoleName[]
}) {
  return (
    <header className="h-20 flex justify-between items-center px-10 bg-background/60 backdrop-blur-xl border-b border-outline-variant/10 z-40">
      <div className="flex items-center gap-12 flex-1">
        <div className="flex items-center gap-4">
          {isAdmin ? (
            <span className="text-xl font-extrabold tracking-tight text-primary shrink-0">Admin Curator</span>
          ) : (
            <span className="text-2xl font-black tracking-tighter text-on-surface font-headline shrink-0">
              {ROLE_DISPLAY[activeRole]}
            </span>
          )}
        </div>

        <div className="relative group flex-1 max-w-2xl">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-outline/40">
            <Search size={18} />
          </div>
          <input
            type="text"
            aria-label={isAdmin ? 'Cari cepat user' : 'Cari dokumen, arsip, atau tugas'}
            placeholder={isAdmin ? 'Quick search users...' : 'Search documents, archives, or tasks...'}
            className="pl-14 pr-6 py-3.5 bg-surface-container/30 border border-outline-variant/20 rounded-2xl w-full text-sm focus:ring-2 focus:ring-primary/40 focus:bg-surface-container placeholder:text-outline/40 outline-none transition-all shadow-inner group-hover:border-outline-variant/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-5">
          <button
            type="button"
            aria-label="Buka notifikasi"
            className="text-outline hover:text-primary hover:bg-primary/5 p-2.5 rounded-xl transition-all relative"
          >
            <Bell size={22} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background" />
          </button>
          <button
            type="button"
            aria-label="Buka pengaturan"
            className="text-outline hover:text-primary hover:bg-primary/5 p-2.5 rounded-xl transition-all"
          >
            <Settings size={22} />
          </button>
        </div>

        <div className="flex items-center gap-4 pl-8 border-l border-outline-variant/10 relative">
          {canSwitchRole && (
            <RoleDropdown
              currentRole={activeRole}
              handleRoleSwitch={handleRoleSwitch}
              roleSwitcherOpen={roleSwitcherOpen}
              setRoleSwitcherOpen={setRoleSwitcherOpen}
              userRoles={userRoles}
            />
          )}

          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-on-surface uppercase tracking-wider">{displayName}</p>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
              {isAdmin ? 'Super Administrator' : ROLE_DISPLAY[activeRole]}
            </p>
          </div>

          <UserDropdown
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
