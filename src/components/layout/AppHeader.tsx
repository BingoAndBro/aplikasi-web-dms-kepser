import {
  Bell,
  ChevronDown,
  Search,
  Settings,
} from 'lucide-react'

import { ROLE_DISPLAY } from '#/lib/types/auth'

import type { RoleName } from '#/lib/types/auth'
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
